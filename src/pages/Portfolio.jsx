import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, Trash2, TrendingUp, TrendingDown,
  PieChart, RefreshCw, ChevronRight, ChevronDown, Receipt,
} from 'lucide-react'
import { stocksService, metadataService } from '../lib/api'
import { portfolioApi } from '../lib/supabase'
import AllocationBreakdown from '../components/portfolio/AllocationBreakdown'
import AddPositionModal from '../components/portfolio/AddPositionModal'
import ProjectionsPanel from '../components/portfolio/ProjectionsPanel'

const ASSET_TYPE_LABEL = {
  stock: 'Stock',
  etf: 'ETF',
  mutual_fund: 'Mutual Fund',
}

export default function Portfolio() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Fetch positions from Supabase
  const {
    data: positions = [],
    isLoading: listLoading,
    error: listError,
  } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.list,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch quotes for all held symbols
  const uniqueSymbols = useMemo(
    () => [...new Set(positions.map((p) => p.symbol))],
    [positions]
  )
  const {
    data: quotes = {},
    isLoading: quotesLoading,
    isFetching: quotesFetching,
    refetch: refetchQuotes,
  } = useQuery({
    queryKey: ['quotes', uniqueSymbols.join(',')],
    queryFn: () => stocksService.getQuotes(uniqueSymbols),
    enabled: uniqueSymbols.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Sector / industry metadata. Sectors rarely change, so cache aggressively.
  const { data: metadata = {} } = useQuery({
    queryKey: ['asset-metadata', uniqueSymbols.join(',')],
    queryFn: () => metadataService.getMetadata(uniqueSymbols),
    enabled: uniqueSymbols.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const removeMutation = useMutation({
    mutationFn: portfolioApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
  })

  // Format helpers
  function formatPrice(n) {
    if (n == null) return '--'
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function formatShares(n) {
    if (n == null) return '--'
    const num = Number(n)
    if (!Number.isFinite(num)) return '--'
    return num.toLocaleString('en-US', { maximumFractionDigits: 4 })
  }
  function formatPercent(n) {
    if (n == null) return '--'
    const sign = n >= 0 ? '+' : ''
    return sign + n.toFixed(2) + '%'
  }
  function formatSignedDollar(n) {
    if (n == null) return '--'
    const sign = n >= 0 ? '+' : '-'
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Portfolio aggregates:
  // Priced positions are marked to market; unpriced fall back to book value
  // so the portfolio total stays meaningful when a quote is missing.
  const aggregates = useMemo(() => {
    let totalCost = 0
    let totalValue = 0
    let dayChange = 0
    let prevDayValue = 0
    let unpricedCount = 0
    let unrealizedShort = 0
    let unrealizedLong = 0
    let realizedShort = 0
    let realizedLong = 0
    for (const p of positions) {
      const q = quotes[p.symbol]
      const pShares = Number(p.shares)
      const pBasis = Number(p.cost_basis_per_share)
      const cost = pShares * pBasis
      totalCost += cost
      if (q?.price != null) {
        const value = pShares * q.price
        totalValue += value
        if (q.change != null) {
          const prev = pShares * (q.price - q.change)
          dayChange += (value - prev)
          prevDayValue += prev
        }
        // ST/LT unrealized split: allocate market value by lot-term shares.
        const sharesShort = Number(p.shares_short || 0)
        const sharesLong = Number(p.shares_long || 0)
        const costShort = Number(p.cost_basis_short || 0)
        const costLong = Number(p.cost_basis_long || 0)
        unrealizedShort += sharesShort * q.price - costShort
        unrealizedLong += sharesLong * q.price - costLong
      } else {
        totalValue += cost
        unpricedCount += 1
      }
      realizedShort += Number(p.realized_pnl_short || 0)
      realizedLong += Number(p.realized_pnl_long || 0)
    }
    const totalReturn = totalValue - totalCost
    const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : null
    const dayChangePct = prevDayValue > 0 ? (dayChange / prevDayValue) * 100 : null
    return {
      totalCost, totalValue, dayChange, dayChangePct,
      totalReturn, totalReturnPct, unpricedCount,
      unrealizedShort, unrealizedLong, realizedShort, realizedLong,
    }
  }, [positions, quotes])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Portfolio
          </h1>
          <p className="text-sm text-text-secondary">
            {positions.length} {positions.length === 1 ? 'position' : 'positions'}
            {aggregates.unpricedCount > 0 && (
              <span className="ml-2 text-text-muted">
                · {aggregates.unpricedCount} showing cost basis (no live quote)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetchQuotes()}
            disabled={quotesFetching || uniqueSymbols.length === 0}
            className="btn-secondary"
          >
            <RefreshCw
              className={`w-4 h-4 ${quotesFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Position
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      {positions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card">
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
              Total Value
            </div>
            <div className="font-mono text-2xl text-ivory">
              {formatPrice(aggregates.totalValue)}
            </div>
            <div className="text-xs text-text-muted mt-1">
              Cost basis {formatPrice(aggregates.totalCost)}
            </div>
          </div>

          <div className="card">
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
              Day Change
            </div>
            <div className={`font-mono text-2xl ${aggregates.dayChange >= 0 ? 'text-positive' : 'text-crimson'}`}>
              {formatSignedDollar(aggregates.dayChange)}
            </div>
            <div className={`text-xs mt-1 ${aggregates.dayChangePct == null ? 'text-text-muted' : aggregates.dayChangePct >= 0 ? 'text-positive' : 'text-crimson'}`}>
              {aggregates.dayChangePct == null ? '--' : formatPercent(aggregates.dayChangePct)}
            </div>
          </div>

          <div className="card">
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
              Total Return
            </div>
            <div className={`font-mono text-2xl ${aggregates.totalReturn >= 0 ? 'text-positive' : 'text-crimson'}`}>
              {formatSignedDollar(aggregates.totalReturn)}
            </div>
            <div className={`text-xs mt-1 ${aggregates.totalReturnPct == null ? 'text-text-muted' : aggregates.totalReturnPct >= 0 ? 'text-positive' : 'text-crimson'}`}>
              {aggregates.totalReturnPct == null ? '--' : formatPercent(aggregates.totalReturnPct)}
            </div>
            {(aggregates.unrealizedShort !== 0 || aggregates.unrealizedLong !== 0) && (
              <div className="text-[10px] text-text-muted mt-2 flex items-center gap-2 font-mono">
                <span>ST {formatSignedDollar(aggregates.unrealizedShort)}</span>
                <span className="text-border">·</span>
                <span>LT {formatSignedDollar(aggregates.unrealizedLong)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Allocation analytics */}
      {positions.length > 0 && (
        <AllocationBreakdown
          positions={positions}
          quotes={quotes}
          metadata={metadata}
        />
      )}

      {/* Projections */}
      {positions.length > 0 && (
        <ProjectionsPanel positions={positions} quotes={quotes} />
      )}

      <AddPositionModal
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
      />

      {/* List error */}
      {listError && (
        <div className="card border-crimson/30">
          <div className="text-crimson text-sm">
            Unable to load portfolio. Check your connection and try again.
          </div>
        </div>
      )}

      {/* Loading */}
      {listLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-surface-elevated rounded w-20" />
                  <div className="h-3 bg-surface-elevated rounded w-40" />
                </div>
                <div className="h-6 bg-surface-elevated rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!listLoading && positions.length === 0 && (
        <div className="card text-center py-16">
          <PieChart className="w-12 h-12 text-text-muted mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ivory mb-2">
            Build your portfolio
          </h2>
          <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
            Add the stocks, ETFs, and mutual funds you actually own. Track value,
            gain/loss, and soon — get advisor guidance against your real holdings.
          </p>
          <button onClick={() => setShowAddForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add Your First Position
          </button>
        </div>
      )}

      {/* Holdings table */}
      {!listLoading && positions.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
            <div className="col-span-3">Symbol</div>
            <div className="col-span-2 text-right">Shares / Cost</div>
            <div className="col-span-2 text-right">Price / Day</div>
            <div className="col-span-2 text-right">Market Value</div>
            <div className="col-span-2 text-right">Gain / Loss</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {positions.map((p) => {
            const q = quotes[p.symbol] || null
            const pShares = Number(p.shares)
            const pBasis = Number(p.cost_basis_per_share)
            const price = q?.price ?? null
            const cost = pShares * pBasis
            const value = price != null ? pShares * price : null
            const gainDollar = value != null ? value - cost : null
            const gainPct = value != null && cost > 0 ? (gainDollar / cost) * 100 : null
            const dayPositive = q && q.change >= 0
            const glPositive = gainPct !== null && gainPct >= 0
            const isExpanded = expandedIds.has(p.id)
            const lots = Array.isArray(p.lots) ? p.lots : []

            return (
              <div
                key={p.id}
                className="card hover:border-gold-dim transition-colors p-0"
              >
                <div
                  onClick={() => toggleExpanded(p.id)}
                  className="grid grid-cols-12 gap-4 items-center p-5 cursor-pointer"
                >
                  {/* Symbol + Name + Asset type */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-3">
                      <div className="text-text-muted">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className={`p-1.5 rounded ${dayPositive === false ? 'bg-crimson/10' : 'bg-positive/10'}`}>
                        {dayPositive === false ? (
                          <TrendingDown className="w-4 h-4 text-crimson" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-positive" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-ivory">
                            {p.symbol}
                          </span>
                          <span className="text-[9px] uppercase tracking-wide text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded">
                            {ASSET_TYPE_LABEL[p.asset_type] || p.asset_type}
                          </span>
                        </div>
                        <div className="text-xs text-text-secondary truncate max-w-[200px]">
                          {p.name || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shares / Cost */}
                  <div className="col-span-2 text-right">
                    <div className="font-mono text-ivory text-sm">
                      {formatShares(pShares)}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      @ {formatPrice(pBasis)}
                    </div>
                  </div>

                  {/* Price / Day */}
                  <div className="col-span-2 text-right">
                    {quotesLoading ? (
                      <div className="h-4 bg-surface-elevated rounded w-16 ml-auto animate-pulse" />
                    ) : q ? (
                      <>
                        <div className="font-mono text-ivory text-sm">
                          {formatPrice(price)}
                        </div>
                        <div className={`text-[10px] font-mono ${dayPositive ? 'text-positive' : 'text-crimson'}`}>
                          {formatPercent(q.changePercent)}
                        </div>
                      </>
                    ) : (
                      <span className="text-text-muted text-sm">--</span>
                    )}
                  </div>

                  {/* Market Value */}
                  <div className="col-span-2 text-right">
                    <div className="font-mono text-ivory text-sm">
                      {formatPrice(value ?? cost)}
                    </div>
                    {value == null && (
                      <div className="text-[10px] text-text-muted">at cost</div>
                    )}
                  </div>

                  {/* Gain / Loss */}
                  <div className="col-span-2 text-right">
                    {gainDollar !== null ? (
                      <>
                        <div className={`font-mono text-sm ${glPositive ? 'text-positive' : 'text-crimson'}`}>
                          {formatPercent(gainPct)}
                        </div>
                        <div className={`text-[10px] font-mono ${glPositive ? 'text-positive' : 'text-crimson'}`}>
                          {formatSignedDollar(gainDollar)}
                        </div>
                      </>
                    ) : (
                      <span className="text-text-muted text-sm">--</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Remove ${p.symbol} from portfolio? This can't be undone.`)) {
                          removeMutation.mutate(p.id)
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="btn-ghost text-text-muted hover:text-crimson p-1.5"
                      title="Remove position"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <LotDetail
                    lots={lots}
                    symbol={p.symbol}
                    currentPrice={price}
                    formatPrice={formatPrice}
                    formatShares={formatShares}
                    formatPercent={formatPercent}
                    formatSignedDollar={formatSignedDollar}
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

function LotDetail({ lots, symbol, currentPrice, formatPrice, formatShares, formatPercent, formatSignedDollar }) {
  if (!lots || lots.length === 0) {
    return (
      <div className="border-t border-border px-5 py-3 text-xs text-text-muted">
        No lot detail available for this position.
      </div>
    )
  }
  // Show newest lots first; visually the most common thing the user is
  // comparing is "which lots are still short term?" which sits at the top.
  const sorted = [...lots].sort(
    (a, b) => new Date(b.buy_date).getTime() - new Date(a.buy_date).getTime()
  )

  return (
    <div className="border-t border-border bg-surface/40">
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wide text-text-muted">
            Lots ({lots.length})
          </div>
          {symbol && (
            <Link
              to={`/transactions?symbol=${symbol}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] uppercase tracking-wide text-gold hover:text-gold-bright flex items-center gap-1"
            >
              <Receipt className="w-3 h-3" />
              See transactions
            </Link>
          )}
        </div>
        <div className="grid grid-cols-12 gap-4 py-1.5 text-[10px] text-text-muted uppercase tracking-wide">
          <div className="col-span-3">Bought</div>
          <div className="col-span-2 text-right">Shares</div>
          <div className="col-span-2 text-right">Cost / share</div>
          <div className="col-span-2 text-right">Held</div>
          <div className="col-span-3 text-right">Unrealized</div>
        </div>
        {sorted.map((lot, i) => {
          const shares = Number(lot.shares)
          const basis = Number(lot.cost_basis_per_share)
          const cost = shares * basis
          const marketValue = currentPrice != null ? shares * currentPrice : null
          const gain = marketValue != null ? marketValue - cost : null
          const gainPct = gain != null && cost > 0 ? (gain / cost) * 100 : null
          const gainPositive = gain !== null && gain >= 0
          const isLong = lot.term === 'long'
          return (
            <div
              key={i}
              className="grid grid-cols-12 gap-4 py-2 items-center border-t border-border/40 text-xs"
            >
              <div className="col-span-3 font-mono text-ivory">
                {lot.buy_date}
              </div>
              <div className="col-span-2 text-right font-mono text-ivory">
                {formatShares(shares)}
              </div>
              <div className="col-span-2 text-right font-mono text-ivory">
                {formatPrice(basis)}
              </div>
              <div className="col-span-2 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono text-text-secondary text-[11px]">
                    {lot.days_held}d
                  </span>
                  <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isLong ? 'bg-positive/10 text-positive' : 'bg-gold/10 text-gold'}`}>
                    {isLong ? 'LT' : 'ST'}
                  </span>
                </div>
              </div>
              <div className="col-span-3 text-right">
                {gain !== null ? (
                  <>
                    <div className={`font-mono text-sm ${gainPositive ? 'text-positive' : 'text-crimson'}`}>
                      {formatSignedDollar(gain)}
                    </div>
                    <div className={`text-[10px] font-mono ${gainPositive ? 'text-positive' : 'text-crimson'}`}>
                      {gainPct != null ? formatPercent(gainPct) : '--'}
                    </div>
                  </>
                ) : (
                  <span className="text-text-muted">--</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
