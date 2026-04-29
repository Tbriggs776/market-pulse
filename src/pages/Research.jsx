import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  Sparkles, FileText, Table2, BarChart3, Plus, Trash2,
  ArrowRight, MessageSquare, X, Check, Activity, DollarSign,
  Percent, Globe, PieChart, ChevronRight, ChevronDown,
} from 'lucide-react'
import { researchService, stocksService, marketService } from '../lib/api'
import { benchApi } from '../lib/supabase'
import AddPositionModal from '../components/portfolio/AddPositionModal'
import PriceChart from '../components/research/PriceChart'
import BenchDossier from '../components/research/BenchDossier'

import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
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

function ResearchBenchGate() {
  const { isAnonymous } = useAuth()
  if (isAnonymous) {
    return (
      <div className="card-elevated text-center py-16 px-6 max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold-dim flex items-center justify-center mx-auto mb-4">
          <Lock className="w-5 h-5 text-gold" />
        </div>
        <h3 className="font-serif text-xl text-ivory mb-2">Research Bench</h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          The Research Bench is for saved research. Stage tickers you're evaluating with status tags and notes &mdash; persistent across sessions.
        </p>
        <Link to="/login" className="btn-primary inline-flex items-center gap-2">
          Sign in to start one
        </Link>
      </div>
    )
  }
  return <ResearchBench />
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
      {activeTab === 'bench' && <ResearchBenchGate />}
      {activeTab === 'overview' && <MarketOverview />}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Market Overview Tab
// ════════════════════════════════════════════════════

function MarketOverview() {
  const {
    data: overview,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['market-overview'],
    queryFn: marketService.getOverview,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  function formatValue(item) {
    if (item.value == null) return '--'
    const val = item.decimals != null
      ? item.value.toFixed(item.decimals)
      : item.value.toString()
    return val + (item.suffix || '')
  }

  function formatPrice(n) {
    if (n == null) return '--'
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatPercent(n) {
    if (n == null) return '--'
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 bg-surface-elevated rounded w-20 mb-3" />
              <div className="h-6 bg-surface-elevated rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card border-crimson/30">
        <div className="flex items-center gap-2 text-crimson text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error.message || 'Failed to load market overview'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Major Indices */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
          <Activity className="w-5 h-5 text-gold" />
          Major Indices & Assets
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {(overview?.indices || []).map((idx) => {
            const isUp = idx.change != null && idx.change >= 0
            return (
              <div key={idx.symbol} className="card hover:border-gold-dim transition-colors">
                <div className="text-xs text-text-muted mb-1">{idx.label}</div>
                <div className="font-mono text-lg text-ivory mb-1">
                  {formatPrice(idx.price)}
                </div>
                {idx.changePercent != null && (
                  <div className={`flex items-center gap-1 font-mono text-sm ${isUp ? 'text-positive' : 'text-crimson'}`}>
                    {isUp ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {formatPercent(idx.changePercent)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Macro Indicators */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
          <Globe className="w-5 h-5 text-gold" />
          Macro Indicators
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {(overview?.macro || []).map((item) => (
            <div key={item.id} className="card">
              <div className="text-xs text-text-muted mb-1">{item.label}</div>
              <div className="font-mono text-xl text-ivory">
                {formatValue(item)}
              </div>
              {item.date && (
                <div className="text-[10px] text-text-muted mt-1">
                  as of {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Yield curve spread */}
      {overview?.macro && (() => {
        const ten = overview.macro.find((m) => m.id === 'DGS10')
        const two = overview.macro.find((m) => m.id === 'DGS2')
        if (ten?.value != null && two?.value != null) {
          const spread = ten.value - two.value
          const inverted = spread < 0
          return (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
                <Percent className="w-5 h-5 text-gold" />
                Yield Curve
              </h2>
              <div className={`card-elevated ${inverted ? 'border-crimson/30' : 'border-positive/20'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-text-muted mb-1">10Y - 2Y Spread</div>
                    <div className={`font-mono text-2xl ${inverted ? 'text-crimson' : 'text-positive'}`}>
                      {spread.toFixed(2)}%
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded text-sm font-medium ${
                    inverted ? 'bg-crimson/10 text-crimson' : 'bg-positive/10 text-positive'
                  }`}>
                    {inverted ? 'Inverted' : 'Normal'}
                  </div>
                </div>
                <p className="text-xs text-text-secondary mt-3">
                  {inverted
                    ? 'An inverted yield curve has historically preceded recessions. Short-term rates exceeding long-term rates signal market expectations of economic slowdown.'
                    : 'A normal yield curve suggests the bond market expects stable or improving economic conditions. Long-term rates above short-term rates reflect healthy growth expectations.'}
                </p>
              </div>
            </section>
          )
        }
        return null
      })()}

      {/* Footer */}
      {overview?.asOf && (
        <div className="text-xs text-text-muted text-right">
          Data as of {new Date(overview.asOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Ticker Brief Tab
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
    if (symbol.trim()) setSearchSymbol(symbol.trim().toUpperCase())
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
                  {brief.company?.exchange && <span className="badge-neutral text-[10px]">{brief.company.exchange}</span>}
                </div>
                <h2 className="text-lg text-ivory font-semibold">{brief.company?.name || brief.symbol}</h2>
                {brief.company?.sector && <p className="text-sm text-text-secondary mt-1">{brief.company.sector}</p>}
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
              {brief.thesis?.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
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
  const [promotingItem, setPromotingItem] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { data: bench = [], isLoading } = useQuery({
    queryKey: ['research-bench'],
    queryFn: benchApi.list,
    staleTime: 5 * 60 * 1000,
  })

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

  // Graduate a bench item to the portfolio: remove from bench after the
  // position has been saved. Bench is for research candidates; owned
  // positions belong on the Portfolio page.
  async function handlePromoteSuccess() {
    if (!promotingItem) return
    try {
      await benchApi.remove(promotingItem.id)
      queryClient.invalidateQueries({ queryKey: ['research-bench'] })
    } catch (_) {
      // Position was saved; bench removal is best-effort. User can delete manually.
    }
    setPromotingItem(null)
  }

  async function handleAdd() {
    if (!addSymbol.trim()) return
    setAddLoading(true)
    setAddError('')
    try {
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
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add to Bench
        </button>
      </div>

      {showAdd && (
        <div className="card-elevated border-gold/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gold uppercase tracking-wide">Add Research Candidate</h3>
            <button onClick={() => { setShowAdd(false); setAddError('') }} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            <input type="text" value={addSymbol} onChange={(e) => setAddSymbol(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} placeholder="Ticker symbol" className="input flex-1 font-mono" maxLength={10} autoFocus />
            <button onClick={handleAdd} disabled={addLoading || !addSymbol.trim()} className="btn-primary">
              {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </div>
          {addError && <div className="flex items-center gap-2 text-crimson text-sm mt-2"><AlertTriangle className="w-4 h-4 shrink-0" />{addError}</div>}
        </div>
      )}

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

      {!isLoading && bench.length === 0 && (
        <div className="card text-center py-16">
          <Table2 className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-ivory mb-2">Research Bench is Empty</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">
            Add tickers you are evaluating. Tag them as bullish, bearish, or passed. Promote winners to your Watchlist.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add First Candidate</button>
        </div>
      )}

      <AddPositionModal
        open={!!promotingItem}
        onClose={() => setPromotingItem(null)}
        onSuccess={handlePromoteSuccess}
        presetSymbol={promotingItem?.symbol}
        presetName={promotingItem?.name}
        presetNotes={promotingItem?.notes}
        title={promotingItem ? `Promote ${promotingItem.symbol} to Portfolio` : 'Add Position'}
      />

      {!isLoading && bench.length > 0 && (
        <div className="space-y-3">
          {bench.map((item) => {
            const quote = quotes[item.symbol] || null
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.evaluating
            const isEditingThis = editingNotes === item.id
            const isExpanded = expandedIds.has(item.id)

            return (
              <div key={item.id} className="card hover:border-gold-dim transition-colors p-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5">
                  <button
                    onClick={() => toggleExpanded(item.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    title={isExpanded ? 'Collapse dossier' : 'Expand dossier'}
                  >
                    <span className="text-text-muted shrink-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-ivory">{item.symbol}</span>
                        <span className={statusCfg.color}>{statusCfg.label}</span>
                      </div>
                      <div className="text-sm text-text-secondary truncate">{item.name}</div>
                    </div>
                  </button>
                  <div className="text-right sm:w-32">
                    {quote ? (
                      <div>
                        <div className="font-mono text-ivory">{formatPrice(quote.price)}</div>
                        <div className={`font-mono text-xs ${quote.change >= 0 ? 'text-positive' : 'text-crimson'}`}>{formatPercent(quote.changePercent)}</div>
                      </div>
                    ) : <span className="text-text-muted">--</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <button key={key} onClick={() => statusMutation.mutate({ id: item.id, status: key })} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${item.status === key ? cfg.color : 'text-text-muted hover:text-ivory bg-surface'}`} title={`Mark as ${cfg.label}`}>{cfg.label}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPromotingItem(item)} className="btn-ghost p-1.5 text-gold hover:text-gold-bright" title="Promote to Portfolio"><PieChart className="w-4 h-4" /></button>
                    <button onClick={() => promoteMutation.mutate(item.id)} disabled={promoteMutation.isPending} className="btn-ghost p-1.5 text-positive hover:text-positive" title="Promote to Watchlist"><ArrowRight className="w-4 h-4" /></button>
                    <button onClick={() => { if (isEditingThis) { setEditingNotes(null) } else { setEditingNotes(item.id); setNotesText(item.notes || '') } }} className="btn-ghost p-1.5" title="Notes"><MessageSquare className="w-4 h-4" /></button>
                    <button onClick={() => removeMutation.mutate(item.id)} className="btn-ghost p-1.5 text-text-muted hover:text-crimson" title="Remove"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {isEditingThis && (
                  <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-border">
                    <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Add research notes..." className="input w-full h-20 text-sm resize-none" />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setEditingNotes(null)} className="btn-ghost text-xs">Cancel</button>
                      <button onClick={() => notesMutation.mutate({ id: item.id, notes: notesText })} disabled={notesMutation.isPending} className="btn-primary text-xs"><Check className="w-3 h-3" /> Save Notes</button>
                    </div>
                  </div>
                )}
                {!isEditingThis && item.notes && (
                  <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-border">
                    <p className="text-xs text-text-secondary italic">{item.notes}</p>
                  </div>
                )}
                {isExpanded && (
                  <BenchDossier
                    symbol={item.symbol}
                    name={item.name}
                    sector={item.sector}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

