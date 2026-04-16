import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  Sparkles, FileText, Table2, BarChart3, Plus, Trash2,
  ArrowRight, MessageSquare, X, Check
} from 'lucide-react'
import { researchService, stocksService } from '../lib/api'
import { benchApi } from '../lib/supabase'

const RESEARCH_TABS = [
  { id: 'brief', label: 'Ticker Brief', icon: FileText },
  { id: 'bench', label: 'Research Bench', icon: Table2 },
  { id: 'overview', label: 'Market Overview', icon: BarChart3 },
]

const STATUS_CONFIG = {
  evaluating: { label: 'Evaluating', color: 'badge-gold' },
  bullish: { label: 'Bullish', color: 'badge-positive' },
  bearish: { label: 'Bearish', color: 'badge-crimson' },
  passed: { label: 'Passed', color: 'badge-neutral' },
}

export default function Research() {
  const [activeTab, setActiveTab] = useState('brief')

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Research
          </h1>
          <p className="text-sm text-text-secondary">
            Analyze tickers, track candidates, monitor markets
          </p>
        </div>
        <div
          className="flex items-center gap-1 p-1 bg-surface rounded-md border border-border"
          role="tablist"
        >
          {RESEARCH_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-gold/15 text-gold-bright'
                  : 'text-text-secondary hover:text-ivory'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'brief' && <TickerBrief />}
      {activeTab === 'bench' && <ResearchBench />}
      {activeTab === 'overview' && <ComingSoon name="Market Overview" />}
    </div>
  )
}

function ComingSoon({ name }) {
  return (
    <div className="card text-center py-16">
      <BarChart3 className="w-12 h-12 text-text-muted mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-ivory mb-2">{name}</h2>
      <p className="text-sm text-text-secondary">Coming in a future pass.</p>
    </div>
  )
}

// ════════════════════════════════════════════════════
// Ticker Brief Tab (unchanged from Pass 5A)
// ════════════════════════════════════════════════════

function TickerBrief() {
  const [symbol, setSymbol] = useState('')
  const [searchSymbol, setSearchSymbol] = useState('')

  const {
    data: brief,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['research-brief', searchSymbol],
    queryFn: () => researchService.getTickerBrief(searchSymbol),
    enabled: !!searchSymbol,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  })

  function handleSearch() {
    if (symbol.trim()) {
      setSearchSymbol(symbol.trim().toUpperCase())
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Enter ticker symbol (e.g. AAPL, MSFT, PNW)"
          className="input flex-1 font-mono"
          maxLength={10}
        />
        <button onClick={handleSearch} disabled={isLoading || !symbol.trim()} className="btn-primary">
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Research
        </button>
      </div>

      {isLoading && (
        <div className="card-elevated border-gold/30 animate-pulse">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-5 h-5 text-gold" />
            <span className="text-sm text-gold">Researching {searchSymbol}...</span>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-surface-elevated rounded w-3/4" />
            <div className="h-4 bg-surface-elevated rounded w-full" />
            <div className="h-4 bg-surface-elevated rounded w-5/6" />
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="card border-crimson/30">
          <div className="flex items-center gap-2 text-crimson text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error.message || 'Failed to generate research brief'}
          </div>
        </div>
      )}

      {brief && !isLoading && (
        <div className="space-y-6">
          <div className="card-elevated">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-2xl font-bold text-gold">{brief.symbol}</span>
                  {brief.company?.exchange && (
                    <span className="badge-neutral text-[10px]">{brief.company.exchange}</span>
                  )}
                </div>
                <h2 className="text-lg text-ivory font-semibold">{brief.company?.name || brief.symbol}</h2>
                {brief.company?.sector && (
                  <p className="text-sm text-text-secondary mt-1">{brief.company.sector}</p>
                )}
              </div>
              {brief.quote && (
                <div className="text-right">
                  <div className="font-mono text-2xl text-ivory">${brief.quote.price?.toFixed(2)}</div>
                  <div className={`font-mono text-sm ${brief.quote.change >= 0 ? 'text-positive' : 'text-crimson'}`}>
                    {brief.quote.change >= 0 ? '+' : ''}{brief.quote.change?.toFixed(2)} ({brief.quote.changePercent?.toFixed(2)}%)
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
              {brief.company?.marketCap && (
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Market Cap</div>
                  <div className="text-sm text-ivory font-mono">${(brief.company.marketCap / 1e9).toFixed(1)}B</div>
                </div>
              )}
              {brief.company?.totalEmployees && (
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Employees</div>
                  <div className="text-sm text-ivory font-mono">{brief.company.totalEmployees.toLocaleString()}</div>
                </div>
              )}
              {brief.company?.listDate && (
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Listed</div>
                  <div className="text-sm text-ivory font-mono">{brief.company.listDate}</div>
                </div>
              )}
              {brief.quote && (
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Day Range</div>
                  <div className="text-sm text-ivory font-mono">${brief.quote.low?.toFixed(2)} - ${brief.quote.high?.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>

          {brief.history && brief.history.length > 0 && (
            <div className="card-elevated">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-4">30-Day Price History</h3>
              <PriceChart data={brief.history} />
            </div>
          )}

          <div className="card-elevated border-gold/20">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-gold" />
              <span className="text-xs font-medium text-gold uppercase tracking-wide">Investment Thesis</span>
            </div>
            <div className="prose-briefing text-sm">
              {brief.thesis?.split(/\n\s*\n/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
              <span>Generated {brief.generatedAt ? new Date(brief.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</span>
              <span className="font-mono">{brief.model}</span>
            </div>
          </div>

          {brief.company?.description && (
            <div className="card">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">About {brief.company.name}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {brief.company.description.length > 600 ? brief.company.description.slice(0, 600) + '...' : brief.company.description}
              </p>
            </div>
          )}
        </div>
      )}

      {!searchSymbol && !isLoading && (
        <div className="card text-center py-16">
          <Search className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-ivory mb-2">Research Any Ticker</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            Enter a stock symbol above to get company details, price data, and an AI-generated investment thesis.
          </p>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Research Bench Tab
// ════════════════════════════════════════════════════

function ResearchBench() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [addSymbol, setAddSymbol] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [editingNotes, setEditingNotes] = useState(null)
  const [notesText, setNotesText] = useState('')

  const { data: bench = [], isLoading } = useQuery({
    queryKey: ['research-bench'],
    queryFn: benchApi.list,
    staleTime: 5 * 60 * 1000,
  })

  // Get quotes for all bench symbols
  const symbols = bench.map((item) => item.symbol)
  const { data: quotes = {} } = useQuery({
    queryKey: ['quotes', 'bench', symbols.join(',')],
    queryFn: () => stocksService.getQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: 2 * 60 * 1000,
  })

  const removeMutation = useMutation({
    mutationFn: benchApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-bench'] }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => benchApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-bench'] }),
  })

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }) => benchApi.updateNotes(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-bench'] })
      setEditingNotes(null)
    },
  })

  const promoteMutation = useMutation({
    mutationFn: benchApi.promoteToWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-bench'] })
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  async function handleAdd() {
    if (!addSymbol.trim()) return
    setAddLoading(true)
    setAddError('')
    try {
      // Look up company info first
      const info = await stocksService.lookupTicker(addSymbol.trim())
      await benchApi.add({
        symbol: addSymbol.trim().toUpperCase(),
        name: info?.name || '',
        sector: info?.exchange || '',
      })
      queryClient.invalidateQueries({ queryKey: ['research-bench'] })
      setShowAdd(false)
      setAddSymbol('')
    } catch (err) {
      setAddError(err.message || 'Failed to add ticker')
    } finally {
      setAddLoading(false)
    }
  }

  function formatPrice(n) {
    if (n == null) return '--'
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatPercent(n) {
    if (n == null) return '--'
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
  }

  return (
    <div className="space-y-6">
      {/* Add button */}
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add to Bench
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card-elevated border-gold/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gold uppercase tracking-wide">Add Research Candidate</h3>
            <button onClick={() => { setShowAdd(false); setAddError('') }} className="btn-ghost p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={addSymbol}
              onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Ticker symbol"
              className="input flex-1 font-mono"
              maxLength={10}
              autoFocus
            />
            <button onClick={handleAdd} disabled={addLoading || !addSymbol.trim()} className="btn-primary">
              {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
          {addError && (
            <div className="flex items-center gap-2 text-crimson text-sm mt-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {addError}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-surface-elevated rounded w-24 mb-2" />
              <div className="h-3 bg-surface-elevated rounded w-48" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && bench.length === 0 && (
        <div className="card text-center py-16">
          <Table2 className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-ivory mb-2">Research Bench is Empty</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">
            Add tickers you are evaluating. Tag them as bullish, bearish, or passed.
            Promote winners to your Watchlist when you are ready to commit.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add First Candidate
          </button>
        </div>
      )}

      {/* Bench items */}
      {!isLoading && bench.length > 0 && (
        <div className="space-y-3">
          {bench.map((item) => {
            const quote = quotes[item.symbol] || null
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.evaluating
            const isEditingThis = editingNotes === item.id

            return (
              <div key={item.id} className="card hover:border-gold-dim transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Symbol + name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-ivory">{item.symbol}</span>
                      <span className={statusCfg.color}>{statusCfg.label}</span>
                    </div>
                    <div className="text-sm text-text-secondary truncate">{item.name}</div>
                  </div>

                  {/* Price */}
                  <div className="text-right sm:w-32">
                    {quote ? (
                      <div>
                        <div className="font-mono text-ivory">{formatPrice(quote.price)}</div>
                        <div className={`font-mono text-xs ${quote.change >= 0 ? 'text-positive' : 'text-crimson'}`}>
                          {formatPercent(quote.changePercent)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </div>

                  {/* Status selector */}
                  <div className="flex items-center gap-1">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => statusMutation.mutate({ id: item.id, status: key })}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                          item.status === key
                            ? cfg.color
                            : 'text-text-muted hover:text-ivory bg-surface'
                        }`}
                        title={`Mark as ${cfg.label}`}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => promoteMutation.mutate(item.id)}
                      disabled={promoteMutation.isPending}
                      className="btn-ghost p-1.5 text-positive hover:text-positive"
                      title="Promote to Watchlist"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (isEditingThis) {
                          setEditingNotes(null)
                        } else {
                          setEditingNotes(item.id)
                          setNotesText(item.notes || '')
                        }
                      }}
                      className="btn-ghost p-1.5"
                      title="Notes"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeMutation.mutate(item.id)}
                      className="btn-ghost p-1.5 text-text-muted hover:text-crimson"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Notes editor */}
                {isEditingThis && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Add research notes..."
                      className="input w-full h-20 text-sm resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => setEditingNotes(null)}
                        className="btn-ghost text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => notesMutation.mutate({ id: item.id, notes: notesText })}
                        disabled={notesMutation.isPending}
                        className="btn-primary text-xs"
                      >
                        <Check className="w-3 h-3" /> Save Notes
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing notes display */}
                {!isEditingThis && item.notes && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-text-secondary italic">{item.notes}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Simple SVG Price Chart
// ════════════════════════════════════════════════════

function PriceChart({ data }) {
  if (!data || data.length < 2) return null

  const prices = data.map((d) => d.close)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const width = 700
  const height = 200
  const padding = 30
  const chartW = width - padding * 2
  const chartH = height - padding * 2

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartW
    const y = padding + chartH - ((d.close - min) / range) * chartH
    return `${x},${y}`
  }).join(' ')

  const isUp = prices[prices.length - 1] >= prices[0]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = padding + chartH - pct * chartH
        const price = min + pct * range
        return (
          <g key={pct}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--color-border, #2A2A33)" strokeWidth="1" />
            <text x={padding - 5} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-text-muted, #5A5E66)">${price.toFixed(0)}</text>
          </g>
        )
      })}
      <polyline points={points} fill="none" stroke={isUp ? '#5FA572' : '#B22234'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.filter((_, i) => i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)).map((d, idx) => {
        const i = idx === 0 ? 0 : idx === 1 ? Math.floor(data.length / 2) : data.length - 1
        const x = padding + (i / (data.length - 1)) * chartW
        return (
          <text key={d.date} x={x} y={height - 5} textAnchor="middle" fontSize="9" fill="var(--color-text-muted, #5A5E66)">
            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        )
      })}
    </svg>
  )
}