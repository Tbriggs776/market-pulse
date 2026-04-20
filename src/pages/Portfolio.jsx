import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, TrendingUp, TrendingDown, Search,
  PieChart, AlertTriangle, RefreshCw, X, Info,
} from 'lucide-react'
import { stocksService, metadataService } from '../lib/api'
import { portfolioApi } from '../lib/supabase'
import AllocationBreakdown from '../components/portfolio/AllocationBreakdown'

const ASSET_TYPES = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual_fund', label: 'Mutual Fund' },
]

const ASSET_TYPE_LABEL = {
  stock: 'Stock',
  etf: 'ETF',
  mutual_fund: 'Mutual Fund',
}

export default function Portfolio() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)

  // Lookup state
  const [searchTicker, setSearchTicker] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  // Form state (revealed after lookup)
  const [assetType, setAssetType] = useState('stock')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [costMode, setCostMode] = useState('per_share')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [notes, setNotes] = useState('')

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

  const addMutation = useMutation({
    mutationFn: portfolioApi.add,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      closeAddForm()
    },
  })

  const removeMutation = useMutation({
    mutationFn: portfolioApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    },
  })

  function closeAddForm() {
    setShowAddForm(false)
    setSearchTicker('')
    setLookupResult(null)
    setLookupError('')
    setAssetType('stock')
    setShares('')
    setCostBasis('')
    setCostMode('per_share')
    setPurchaseDate('')
    setNotes('')
  }

  async function handleLookup() {
    if (!searchTicker.trim()) return
    setLookupLoading(true)
    setLookupError('')
    setLookupResult(null)

    const result = await stocksService.lookupTicker(searchTicker.trim())
    if (!result || result.error) {
      setLookupError(result?.error || `Could not find ticker: ${searchTicker}`)
    } else {
      setLookupResult(result)
      if (result.quote?.price != null && !costBasis) {
        setCostBasis(String(result.quote.price))
      }
    }
    setLookupLoading(false)
  }

  function handleAdd() {
    if (!lookupResult) return
    const sharesNum = parseFloat(shares)
    const costNum = parseFloat(costBasis)
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) return
    if (!Number.isFinite(costNum) || costNum < 0) return

    const costPerShare = costMode === 'total' ? costNum / sharesNum : costNum

    addMutation.mutate({
      symbol: searchTicker.trim().toUpperCase(),
      name: lookupResult.name || '',
      assetType,
      shares: sharesNum,
      costBasisPerShare: costPerShare,
      purchaseDate: purchaseDate || null,
      notes: notes.trim() || null,
    })
  }

  // Flags a merge into an existing lot so the user isn't surprised by averaging.
  const matchingPosition = useMemo(() => {
    if (!lookupResult || !searchTicker) return null
    const sym = searchTicker.trim().toUpperCase()
    return positions.find(
      (p) => p.symbol === sym && p.asset_type === assetType
    ) || null
  }, [lookupResult, searchTicker, assetType, positions])

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
      } else {
        totalValue += cost
        unpricedCount += 1
      }
    }
    const totalReturn = totalValue - totalCost
    const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : null
    const dayChangePct = prevDayValue > 0 ? (dayChange / prevDayValue) * 100 : null
    return { totalCost, totalValue, dayChange, dayChangePct, totalReturn, totalReturnPct, unpricedCount }
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

      {/* Add Position Modal */}
      {showAddForm && (
        <div className="card-elevated border-gold/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gold uppercase tracking-wide">
              Add Position
            </h3>
            <button onClick={closeAddForm} className="btn-ghost p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step 1: Lookup */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Enter ticker symbol (e.g. AAPL, VOO, VFIAX)"
              className="input flex-1 font-mono"
              maxLength={10}
              autoFocus
            />
            <button
              onClick={handleLookup}
              disabled={lookupLoading || !searchTicker.trim()}
              className="btn-secondary"
            >
              {lookupLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Look Up
            </button>
          </div>

          {lookupError && (
            <div className="flex items-center gap-2 text-crimson text-sm mb-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {lookupError}
            </div>
          )}

          {/* Step 2: Position details */}
          {lookupResult && (
            <div className="bg-surface rounded-lg p-4 border border-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-gold font-semibold text-lg">
                    {searchTicker}
                  </span>
                  <span className="text-text-secondary text-sm ml-2">
                    {lookupResult.exchange}
                  </span>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {lookupResult.name}
                  </p>
                </div>
                {lookupResult.quote && (
                  <span className="text-ivory font-mono text-lg">
                    {formatPrice(lookupResult.quote.price)}
                  </span>
                )}
              </div>

              {/* Merge notice */}
              {matchingPosition && (
                <div className="flex items-start gap-2 text-xs text-gold bg-gold/5 border border-gold/20 rounded p-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    You already hold {formatShares(matchingPosition.shares)} {ASSET_TYPE_LABEL[matchingPosition.asset_type].toLowerCase()} shares of {matchingPosition.symbol} at an average cost of {formatPrice(matchingPosition.cost_basis_per_share)}. Adding here will average the cost basis and sum the shares.
                  </span>
                </div>
              )}

              {/* Asset type */}
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
                  Asset Type
                </label>
                <div className="flex gap-2">
                  {ASSET_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setAssetType(t.value)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                        assetType === t.value
                          ? 'bg-gold/10 text-gold border-gold/40'
                          : 'bg-surface-elevated text-text-secondary border-border hover:text-ivory'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shares */}
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
                  Shares
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="e.g. 10 or 2.5"
                  className="input w-full font-mono"
                />
              </div>

              {/* Cost basis */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] uppercase tracking-wide text-text-muted">
                    Cost Basis
                  </label>
                  <div className="flex gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCostMode('per_share')}
                      className={`px-2 py-0.5 rounded ${costMode === 'per_share' ? 'bg-gold/10 text-gold' : 'text-text-muted hover:text-ivory'}`}
                    >
                      Per share
                    </button>
                    <button
                      type="button"
                      onClick={() => setCostMode('total')}
                      className={`px-2 py-0.5 rounded ${costMode === 'total' ? 'bg-gold/10 text-gold' : 'text-text-muted hover:text-ivory'}`}
                    >
                      Total cost
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  placeholder={costMode === 'per_share' ? 'Price per share' : 'Total amount paid'}
                  className="input w-full font-mono"
                />
                {costMode === 'total' && shares && costBasis && parseFloat(shares) > 0 && (
                  <div className="text-[10px] text-text-muted mt-1">
                    = {formatPrice(parseFloat(costBasis) / parseFloat(shares))} per share
                  </div>
                )}
              </div>

              {/* Purchase date */}
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
                  Purchase Date <span className="text-text-muted normal-case">(optional)</span>
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="input w-full font-mono"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
                  Notes <span className="text-text-muted normal-case">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Thesis, conviction level, tax lot details, etc."
                  rows={2}
                  maxLength={500}
                  className="input w-full resize-none"
                />
              </div>

              <button
                onClick={handleAdd}
                disabled={
                  addMutation.isPending ||
                  !shares ||
                  !costBasis ||
                  parseFloat(shares) <= 0
                }
                className="btn-primary w-full"
              >
                {addMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {matchingPosition ? `Merge into ${searchTicker} position` : `Add ${searchTicker} to Portfolio`}
              </button>

              {addMutation.isError && (
                <div className="flex items-center gap-2 text-crimson text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {addMutation.error?.message || 'Could not save position. Try again.'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

            return (
              <div
                key={p.id}
                className="card grid grid-cols-12 gap-4 items-center hover:border-gold-dim transition-colors"
              >
                {/* Symbol + Name + Asset type */}
                <div className="col-span-3">
                  <div className="flex items-center gap-3">
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
                    onClick={() => {
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
            )
          })}
        </div>
      )}
    </div>
  )
}
