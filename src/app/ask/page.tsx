'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, Loader2, AlertCircle, Wrench } from 'lucide-react'

interface ClientMessage {
  role: 'user' | 'assistant'
  text: string
  trace?: { type: 'tool_call'; tool: string; args: Record<string, unknown> }[]
}

const SUGGESTIONS = [
  'What is the current total portfolio?',
  'How much SFR do we have outstanding right now?',
  'Show me the Holmes Homes loans by segment',
  'What\'s in the approved pipeline?',
  'What does the portfolio look like in 6 months?',
]

export default function AskPage() {
  const [messages, setMessages] = useState<ClientMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll the transcript to the latest message — both on new messages
  // and during loading so the user sees the "thinking" indicator.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim()
    if (!text || loading) return
    setError(null)
    setInput('')
    const next: ClientMessage[] = [...messages, { role: 'user', text }]
    setMessages(next)
    setLoading(true)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, text: m.text })) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`)
      setMessages([...next, {
        role: 'assistant',
        text: body.text ?? '(no response)',
        trace: body.trace,
      }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="h-full flex flex-col p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-sm font-medium text-fg-strong flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" />
            Ask
          </h1>
          <p className="text-[10px] text-fg-dim mt-0.5">
            Conversational analytics over your portfolio data · Gemini 2.5 Flash
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setError(null) }}
            className="btn-ghost text-[10px]"
          >
            New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto card p-4 mb-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-10 space-y-4">
            <div className="text-fg-dim text-xs">
              Ask any question about the portfolio. The agent has tools to read
              your forecast, loans, approved pipeline, and parent companies.
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[10px] px-2 py-1 border border-border rounded-full text-fg-dim hover:text-fg hover:border-border-strong transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-xs leading-relaxed ${m.role === 'user' ? 'text-fg-strong font-medium' : 'text-fg'}`}
          >
            <div className="text-[9px] uppercase tracking-wide text-fg-dim mb-0.5">
              {m.role === 'user' ? 'You' : 'Agent'}
            </div>
            {m.trace && m.trace.length > 0 && (
              <div className="mb-1.5 text-[10px] text-fg-dim space-y-0.5">
                {m.trace.map((t, j) => (
                  <div key={j} className="flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" />
                    <span className="font-mono">{t.tool}</span>
                    {Object.keys(t.args).length > 0 && (
                      <span className="font-mono opacity-70">
                        ({Object.entries(t.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap">{m.text}</div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-[10px] text-fg-dim">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking…
          </div>
        )}

        {error && (
          <div className="card p-2 text-[10px] text-danger flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="flex gap-2 items-end"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
          placeholder="Ask about your portfolio… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={loading}
          className="form-input flex-1 text-xs py-2 resize-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn-primary inline-flex items-center gap-1 text-xs py-2 px-3 disabled:opacity-50"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />}
          Send
        </button>
      </form>

      <div className="text-[9px] text-fg-dim italic px-1 mt-2">
        The agent only sees what its tools return — it can't write to the DB
        or take actions, only answer questions. Numbers come from the same engine
        that powers the Dashboard and Forecast pages, so they should match exactly.
      </div>
    </div>
  )
}
