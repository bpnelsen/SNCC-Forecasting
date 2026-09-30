import { NextRequest, NextResponse } from 'next/server'
import { TOOL_DECLARATIONS, TOOL_HANDLERS, SYSTEM_INSTRUCTION } from '@/lib/gemini-tools'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// OpenRouter aggregates many models behind one OpenAI-compatible endpoint.
// Free-tier model list and IDs are at https://openrouter.ai/models?max_price=0.
// Pick a model in env (OPENROUTER_MODEL); we default to Llama 3.3 70B, which
// has solid function-calling support and a generous free tier.
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL_ID = 'meta-llama/llama-3.3-70b-instruct:free'

// Cap the agentic loop. Five passes is enough for any analytical question
// that needs more than one tool call without runaway loops.
const MAX_TOOL_ITERATIONS = 5

// Wrap our declarations in OpenAI's tool format. Our `parameters` is already
// JSON schema (object/properties/required) so no shape translation is needed
// beyond the outer envelope.
const openaiTools = TOOL_DECLARATIONS.map(t => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}))

interface ClientMessage {
  role: 'user' | 'assistant'
  text: string
}

interface AgentTrace {
  type: 'tool_call'
  tool: string
  args: Record<string, unknown>
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

interface OpenRouterResponse {
  choices?: Array<{
    message: OpenAIMessage
    finish_reason: string
  }>
  model?: string
  error?: { message: string }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'OPENROUTER_API_KEY not set. Get a free key at openrouter.ai/keys and add it in Vercel env vars.',
    }, { status: 500 })
  }
  const modelId = process.env.OPENROUTER_MODEL || DEFAULT_MODEL_ID

  let body: { messages?: ClientMessage[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const messages = body.messages ?? []
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  // Build the OpenAI-style transcript: system prompt first, then the user-
  // assistant history. Tool calls and tool results from this turn are
  // appended inside the loop below.
  const chatMessages: OpenAIMessage[] = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    })),
  ]

  const trace: AgentTrace[] = []

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const res = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          // Optional but recommended by OpenRouter — shows up on their
          // dashboard so you can see which deploy is making the calls.
          'X-Title': 'SNCC Forecasting · Ask',
        },
        body: JSON.stringify({
          model: modelId,
          messages: chatMessages,
          tools: openaiTools,
          tool_choice: 'auto',
          temperature: 0.2,
        }),
      })

      const parsed: OpenRouterResponse = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json({
          error: parsed.error?.message || `${res.status} ${res.statusText}`,
          model: modelId,
          trace,
        }, { status: 500 })
      }

      const choice = parsed.choices?.[0]
      const message = choice?.message
      if (!message) {
        return NextResponse.json({
          error: 'Empty response from OpenRouter',
          model: modelId,
          trace,
        }, { status: 500 })
      }

      const toolCalls = message.tool_calls ?? []

      // No tool calls → final answer. Return whatever text the model wrote.
      if (toolCalls.length === 0) {
        return NextResponse.json({
          text: (message.content || '').trim() || '(no response)',
          model: parsed.model || modelId,
          trace,
        })
      }

      // Echo the assistant's tool-calling turn back into the transcript so
      // the model can see what it just asked for. OpenAI's protocol requires
      // the assistant message AND one tool message per call.
      chatMessages.push(message)

      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {}
        try { args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {} } catch { /* keep empty */ }
        trace.push({ type: 'tool_call', tool: tc.function.name, args })

        const handler = TOOL_HANDLERS[tc.function.name]
        let result: unknown
        try {
          result = handler
            ? await handler(args)
            : { error: `Unknown tool: ${tc.function.name}` }
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) }
        }

        chatMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        })
      }
    }

    return NextResponse.json({
      text: 'Hit max tool iterations without a final answer. Try a more specific question.',
      model: modelId,
      trace,
    })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      model: modelId,
      trace,
    }, { status: 500 })
  }
}
