import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  Bot, Plus, Trash2, Send, Sparkles, Brain,
  MessageSquare, Loader2, AlertTriangle, Wrench,
  ChevronDown, ChevronRight, Check, X,
} from 'lucide-react'
import { advisorService } from '../lib/api'

const MODELS = [
  { key: 'sonnet', label: 'Sonnet', icon: Brain, desc: 'Fast, capable (default)' },
  { key: 'opus', label: 'Opus', icon: Sparkles, desc: 'Deeper reasoning' },
]

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const TOOL_LABELS = {
  get_quote: 'Quote',
  research_ticker: 'Research',
  get_market_overview: 'Market overview',
  get_treasury_snapshot: 'Treasury snapshot',
  search_news: 'News search',
  get_user_watchlist: 'Watchlist refresh',
}

function toolInputSummary(name, input) {
  if (!input) return ''
  if (name === 'get_quote') return (input.symbols || []).join(', ')
  if (name === 'research_ticker') return input.symbol || ''
  if (name === 'search_news') return input.category || ''
  return ''
}

export default function Advisor() {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState(null)
  const [modelKey, setModelKey] = useState('sonnet')
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [streamToolEvents, setStreamToolEvents] = useState([])
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const convsQ = useQuery({
    queryKey: ['advisor-conversations'],
    queryFn: advisorService.listConversations,
    staleTime: 30 * 1000,
  })

  const activeConvQ = useQuery({
    queryKey: ['advisor-conversation', activeId],
    queryFn: () => advisorService.getConversation(activeId),
    enabled: !!activeId,
    staleTime: 0,
  })

  const conversations = convsQ.data || []
  const messages = activeConvQ.data?.messages || []

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, streamBuffer, streamToolEvents.length])

  const handleNewConversation = () => {
    setActiveId(null)
    setInput('')
    setError(null)
    setStreamBuffer('')
    setStreamToolEvents([])
    inputRef.current?.focus()
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    try {
      await advisorService.deleteConversation(id)
      if (activeId === id) setActiveId(null)
      queryClient.invalidateQueries({ queryKey: ['advisor-conversations'] })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setError(null)
    setStreaming(true)
    setStreamBuffer('')
    setStreamToolEvents([])
    setInput('')

    const optimisticUserMsg = {
      id: `tmp-user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    queryClient.setQueryData(['advisor-conversation', activeId], (prev) => {
      if (!prev) return { conversation: null, messages: [optimisticUserMsg] }
      return { ...prev, messages: [...prev.messages, optimisticUserMsg] }
    })

    try {
      let convId = activeId
      await advisorService.sendMessage({
        conversationId: activeId,
        userMessage: text,
        modelKey,
        onMeta: ({ conversationId }) => {
          if (!activeId && conversationId) {
            setActiveId(conversationId)
            convId = conversationId
          }
        },
        onDelta: (chunk) => {
          setStreamBuffer((prev) => prev + chunk)
        },
        onToolCall: (evt) => {
          setStreamToolEvents((prev) => [...prev, { ...evt, kind: 'call' }])
        },
        onToolResult: (evt) => {
          setStreamToolEvents((prev) => [...prev, { ...evt, kind: 'result' }])
        },
        onError: (msg) => {
          setError(msg)
        },
      })
      queryClient.invalidateQueries({ queryKey: ['advisor-conversations'] })
      if (convId) {
        queryClient.invalidateQueries({ queryKey: ['advisor-conversation', convId] })
      }
      setStreamBuffer('')
      setStreamToolEvents([])
    } catch (err) {
      setError(err.message || 'Send failed')
      setStreamBuffer('')
      setStreamToolEvents([])
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, modelKey, activeId, queryClient])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group tool_call + tool_result events by id so we render one chip each
  const toolChips = (() => {
    const map = new Map()
    for (const e of streamToolEvents) {
      const existing = map.get(e.id) || { id: e.id, name: e.name, input: e.input, status: 'running' }
      if (e.kind === 'result') {
        existing.status = e.status || 'ok'
        existing.summary = e.summary
      }
      map.set(e.id, existing)
    }
    return [...map.values()]
  })()

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-180px)] min-h-[500px]">
      {/* Sidebar */}
      <aside className="card-elevated flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h2 className="text-sm font-medium text-ivory flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gold" />
            Conversations
          </h2>
          <button onClick={handleNewConversation} className="btn-ghost p-1.5" title="New conversation">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convsQ.isLoading && (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="w-4 h-4 text-gold animate-spin" />
            </div>
          )}
          {convsQ.error && <div className="p-3 text-xs text-crimson">{convsQ.error.message}</div>}
          {!convsQ.isLoading && conversations.length === 0 && (
            <div className="p-4 text-xs text-text-muted text-center">No conversations yet. Start one below.</div>
          )}
          {conversations.map((c) => {
            const isActive = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors group ${isActive ? 'bg-gold/10' : 'hover:bg-surface'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs truncate ${isActive ? 'text-gold' : 'text-ivory'}`}>{c.title}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{formatTime(c.updated_at)}</div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-crimson transition-opacity p-1"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main chat */}
      <section className="card-elevated flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-4 h-4 text-gold shrink-0" />
            <h1 className="text-sm font-medium text-ivory truncate">
              {activeConvQ.data?.conversation?.title || 'New conversation'}
            </h1>
          </div>
          <div className="flex items-center gap-1 bg-surface rounded-md border border-border p-0.5 shrink-0">
            {MODELS.map((m) => (
              <button
                key={m.key}
                onClick={() => setModelKey(m.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${modelKey === m.key ? 'bg-gold/15 text-gold-bright' : 'text-text-secondary hover:text-ivory'}`}
                title={m.desc}
              >
                <m.icon className="w-3 h-3" />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
          {!activeId && messages.length === 0 && !streamBuffer && (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold-dim flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-gold" />
              </div>
              <h3 className="font-serif text-xl text-ivory mb-2">Market Pulse Advisor</h3>
              <p className="text-sm text-text-secondary max-w-sm mb-6">
                Portfolio-aware research with live market tools. Claude can fetch quotes, run research dossiers, pull macro data, and search news mid-conversation.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {[
                  'Pull a fresh research dossier on NVDA',
                  "What's the 10Y yield telling us right now?",
                  'Compare my watchlist tickers on day performance',
                  "What's in business news today that matters for my watchlist?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus() }}
                    className="text-left text-xs text-text-secondary hover:text-ivory hover:bg-surface p-2.5 rounded border border-border transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}

          {streaming && toolChips.length > 0 && (
            <div className="flex gap-3">
              <div className="shrink-0 w-7" />
              <div className="flex flex-col gap-1.5">
                {toolChips.map((t) => <ToolChip key={t.id} tool={t} />)}
              </div>
            </div>
          )}

          {streaming && streamBuffer && (
            <MessageBubble role="assistant" content={streamBuffer} streaming />
          )}

          {streaming && !streamBuffer && toolChips.length === 0 && (
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <Loader2 className="w-3 h-3 animate-spin text-gold" />
              <span>Thinking...</span>
            </div>
          )}

          {error && (
            <div className="card border-crimson/30 bg-crimson/5">
              <div className="flex items-center gap-2 text-crimson text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? 'Streaming...' : 'Ask the advisor anything. Claude can fetch live quotes, research tickers, check macro, search news.'}
              disabled={streaming}
              rows={2}
              className="input flex-1 resize-none text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="btn-primary px-4 py-2.5 shrink-0"
              title="Send (Enter)"
            >
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-text-muted">
            <span>{modelKey === 'opus' ? 'Opus 4.7 -- deeper reasoning, slower' : 'Sonnet 4.6 -- fast default'}</span>
            <span>Enter to send -- Shift+Enter for newline</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function ToolChip({ tool }) {
  const [expanded, setExpanded] = useState(false)
  const running = tool.status === 'running'
  const isErr = tool.status === 'error'
  const icon = running ? Loader2 : (isErr ? X : Check)
  const IconEl = icon
  const colorClass = running ? 'text-gold' : (isErr ? 'text-crimson' : 'text-positive')
  const label = TOOL_LABELS[tool.name] || tool.name
  const inputText = toolInputSummary(tool.name, tool.input)

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="flex items-center gap-2 px-2.5 py-1.5 bg-surface hover:bg-surface-elevated border border-border rounded text-[11px] text-text-secondary transition-colors text-left"
    >
      <Wrench className="w-3 h-3 text-text-muted shrink-0" />
      <span className="text-ivory">{label}</span>
      {inputText && <span className="text-text-muted font-mono">{inputText}</span>}
      <IconEl className={`w-3 h-3 shrink-0 ${colorClass} ${running ? 'animate-spin' : ''}`} />
      {tool.summary && expanded && (
        <span className="text-text-muted font-mono ml-1">-- {tool.summary}</span>
      )}
      {tool.summary && !expanded && (
        <ChevronRight className="w-3 h-3 text-text-muted/60" />
      )}
      {expanded && <ChevronDown className="w-3 h-3 text-text-muted/60" />}
    </button>
  )
}

function MessageBubble({ role, content, streaming = false }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-gold/10 border border-gold-dim rounded-lg px-4 py-2.5">
          <div className="text-sm text-ivory whitespace-pre-wrap leading-relaxed">{content}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-gold/10 border border-gold-dim flex items-center justify-center">
        <Sparkles className="w-3.5 h-3.5 text-gold" />
      </div>
      <div className="flex-1 min-w-0 text-sm text-ivory leading-relaxed prose-advisor">
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="text-gold-bright font-semibold">{children}</strong>,
            em: ({ children }) => <em className="text-text-secondary italic">{children}</em>,
            ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
            li: ({ children }) => <li className="text-ivory">{children}</li>,
            code: ({ inline, children }) => inline
              ? <code className="bg-surface-elevated px-1 py-0.5 rounded font-mono text-[12px] text-gold-bright">{children}</code>
              : <code className="block bg-surface-elevated p-2 rounded font-mono text-[12px] text-gold-bright overflow-x-auto my-2">{children}</code>,
            h1: ({ children }) => <h1 className="text-base font-semibold text-ivory mt-3 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-sm font-semibold text-ivory mt-3 mb-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold text-ivory mt-3 mb-1">{children}</h3>,
            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-gold hover:text-gold-bright underline">{children}</a>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-gold-dim pl-3 text-text-secondary italic my-2">{children}</blockquote>,
            table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full text-xs border-collapse">{children}</table></div>,
            th: ({ children }) => <th className="border border-border px-2 py-1 bg-surface text-left font-medium">{children}</th>,
            td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
          }}
        >{content}</ReactMarkdown>
        {streaming && <span className="inline-block w-2 h-4 bg-gold ml-0.5 align-middle animate-pulse" />}
      </div>
    </div>
  )
}