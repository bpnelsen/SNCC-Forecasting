import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import { TOOL_DECLARATIONS, TOOL_HANDLERS, SYSTEM_INSTRUCTION } from '@/lib/gemini-tools'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Loop over tool calls can take several seconds; bump above Vercel's default.
export const maxDuration = 60

// Gemini 2.0 Flash is free-tier eligible (15 RPM / 1M tokens-day at time of
// writing). Swap to "gemini-2.5-flash" if available in your account for
// stronger multi-step reasoning at the same price (still free tier).
const MODEL_ID = 'gemini-2.0-flash'

// Cap the agentic loop. Five passes is enough for any analytical question
// that needs more than one tool call without runaway loops.
const MAX_TOOL_ITERATIONS = 5

// Translate our tool declarations into Gemini's expected shape. We use raw
// type strings (object/string/integer/...) in TOOL_DECLARATIONS so the
// declarations stay readable; map to the Type enum here at the boundary.
function toGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const s = schema as Record<string, unknown>
  const out: Record<string, unknown> = { ...s }
  if (typeof s.type === 'string') {
    const map: Record<string, Type> = {
      object:  Type.OBJECT,
      string:  Type.STRING,
      integer: Type.INTEGER,
      number:  Type.NUMBER,
      boolean: Type.BOOLEAN,
      array:   Type.ARRAY,
    }
    out.type = map[s.type] ?? s.type
  }
  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s.properties)) props[k] = toGeminiSchema(v)
    out.properties = props
  }
  if (s.items) out.items = toGeminiSchema(s.items)
  return out
}

const geminiTools = [{
  functionDeclarations: TOOL_DECLARATIONS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.parameters) as never,
  })),
}]

interface ClientMessage {
  role: 'user' | 'assistant'
  text: string
}

interface AgentTrace {
  type: 'tool_call'
  tool: string
  args: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'GEMINI_API_KEY not set on the server. Add it in Vercel env vars or .env.local.',
    }, { status: 500 })
  }

  let body: { messages?: ClientMessage[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const messages = body.messages ?? []
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  // Convert the client-side history to Gemini's "contents" shape.
  // user → user, assistant → model. We don't replay prior tool calls — the
  // model treats the conversation as one continuous thread and may re-call
  // tools if it needs fresh data, which is fine for low-volume analyst use.
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }))

  const ai = new GoogleGenAI({ apiKey })
  const trace: AgentTrace[] = []

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: geminiTools as never,
        },
      })

      const cand = response.candidates?.[0]
      const parts = cand?.content?.parts ?? []
      const fnCalls = parts.filter((p: { functionCall?: unknown }) => p.functionCall)

      // No tool calls → we have the final answer. Extract the concatenated text.
      if (fnCalls.length === 0) {
        const text = parts
          .map((p: { text?: string }) => p.text ?? '')
          .filter(Boolean)
          .join('')
        return NextResponse.json({ text: text || '(no response)', trace })
      }

      // Echo the model turn back into the transcript, then execute each
      // requested tool and append the responses as a single user turn.
      contents.push({
        role: 'model',
        parts: parts as never,
      })

      const toolResponses: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> = []
      for (const part of fnCalls) {
        const fn = (part as { functionCall: { name: string; args?: Record<string, unknown> } }).functionCall
        trace.push({ type: 'tool_call', tool: fn.name, args: fn.args ?? {} })
        const handler = TOOL_HANDLERS[fn.name]
        let result: unknown
        try {
          result = handler
            ? await handler(fn.args ?? {})
            : { error: `Unknown tool: ${fn.name}` }
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) }
        }
        toolResponses.push({
          functionResponse: {
            name: fn.name,
            response: result as Record<string, unknown>,
          },
        })
      }

      contents.push({
        role: 'user',
        parts: toolResponses as never,
      })
    }

    return NextResponse.json({
      text: 'Hit max tool iterations without a final answer. Try a more specific question.',
      trace,
    })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      trace,
    }, { status: 500 })
  }
}
