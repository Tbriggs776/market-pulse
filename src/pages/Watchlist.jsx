import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, TrendingUp, TrendingDown, Search,
  Star, AlertTriangle, RefreshCw, X
} from 'lucide-react'
import { stocksService } from '../lib/api'
import { watchlistApi } from '../lib/supabase'

export default function Watchlist() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchTicker, setSearchTicker] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  // Fetch watchlist items from Supabase
  const {
    data: watchlist = [],
    isLoading: listLoading,
    error: listError,
  } = useQuery({
    queryKey: ['watchlist'],
    queryFn: watchlistApi.list,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch live quotes for all watchlist symbols
  const symbols = watchlist.map((item) => item.symbol)
  const {
    data: quotes = {},
    isLoading: quotesLoading,
    isFetching: quotesFetching,
    refetch: refetchQuotes,
  } = useQuery({
    queryKey: ['quotes', symbols.join(',')],
    queryFn: () => stocksService.getQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Add mutation
  const addMutation = useMutation({
    mutationFn: watchlistApi.add,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      setShowAddForm(false)
      setSearchTicker('')
      setLookupResult(null)
    },
  })

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: watchlistApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
  })

  // Ticker lookup
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
    }
    setLookupLoading(false)
  }

  // Add from lookup result
  function handleAdd() {
    if (!lookupResult) return
    const price = lookupResult.quote?.price || null
    addMutation.mutate({
      symbol: searchTicker.trim().toUpperCase(),
      name: lookupResult.name || '',
      exchange: lookupResult.exchange || '',
      addedPrice: price,
    })
  }

  // Format helpers
  function formatPrice(n) {
    if (n == null) return '--'
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatPercent(n) {
    if (n == null) return '--'
    const sign = n >= 0 ? '+' : ''
    return sign + n.toFixed(2) + '%'
  }

  function gainLoss(current, added) {
    if (current == null || added == null || added === 0) return null
    const pct = ((current - added) / added) * 100
    return Math.round(pct * 100) / 100
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Watchlist
          </h1>
          <p className="text-sm text-text-secondary">
            {watchlist.length} {watchlist.length === 1 ? 'position' : 'positions'} tracked
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetchQuotes()}
            disabled={quotesFetching}
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
            Add Ticker
          </button>
        </div>
      </div>

      {/* Add Ticker Modal */}
      {showAddForm && (
        <div className="card-elevated border-gold/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gold uppercase tracking-wide">
              Add to Watchlist
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false)
                setSearchTicker('')
                setLookupResult(null)
                setLookupError('')
              }}
              className="btn-ghost p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              placeholder="Enter ticker symbol (e.g. AAPL)"
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

          {lookupResult && (
            <div className="bg-surface rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono text-gold font-semibold text-lg">
                    {searchTicker}
                  </span>
                  <span className="text-text-secondary text-sm ml-2">
                    {lookupResult.exchange}
                  </span>
                </div>
                {lookupResult.quote && (
                  <span className="text-ivory font-mono text-lg">
                    {formatPrice(lookupResult.quote.price)}
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary mb-3">
                {lookupResult.name}
              </p>
              {lookupResult.quote && (
                <div className="flex gap-4 text-xs text-text-muted mb-3">
                  <span>Open: {formatPrice(lookupResult.quote.open)}</span>
                  <span>High: {formatPrice(lookupResult.quote.high)}</span>
                  <span>Low: {formatPrice(lookupResult.quote.low)}</span>
                  <span className={lookupResult.quote.change >= 0 ? 'text-positive' : 'text-crimson'}>
                    {formatPercent(lookupResult.quote.changePercent)}
                  </span>
                </div>
              )}
              <button
                onClick={handleAdd}
                disabled={addMutation.isPending}
                className="btn-primary w-full"
              >
                {addMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add {searchTicker} to Watchlist
                {lookupResult.quote && ` at ${formatPrice(lookupResult.quote.price)}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {listError && (
        <div className="card border-crimson/30">
          <div className="text-crimson text-sm">
            Unable to load watchlist. Check your connection and try again.
          </div>
        </div>
      )}

      {/* Loading state */}
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
      {!listLoading && watchlist.length === 0 && (
        <div className="card text-center py-16">
          <Star className="w-12 h-12 text-text-muted mx-auto mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ivory mb-2">
            No positions tracked yet
          </h2>
          <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
            Add tickers to your watchlist to track prices, monitor performance,
            and get AI-powered insights on your portfolio.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Add Your First Ticker
          </button>
        </div>
      )}

      {/* Watchlist table */}
      {!listLoading && watchlist.length > 0 && (
        <div className="space-y-2">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
            <div className="col-span-4">Symbol</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-2 text-right">Day Change</div>
            <div className="col-span-2 text-right">Since Added</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Rows */}
          {watchlist.map((item) => {
            const quote = quotes[item.symbol] || null
            const gl = gainLoss(quote?.price, item.added_price)
            const dayPositive = quote && quote.change >= 0
            const glPositive = gl !== null && gl >= 0

            return (
              <div
                key={item.id}
                className="card grid grid-cols-12 gap-4 items-center hover:border-gold-dim transition-colors"
              >
                {/* Symbol + Name */}
                <div className="col-span-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded ${dayPositive === false ? 'bg-crimson/10' : 'bg-positive/10'}`}>
                      {dayPositive === false ? (
                        <TrendingDown className="w-4 h-4 text-crimson" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-positive" />
                      )}
                    </div>
                    <div>
                      <div className="font-mono font-semibold text-ivory">
                        {item.symbol}
                      </div>
                      <div className="text-xs text-text-secondary truncate max-w-[200px]">
                        {item.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Current Price */}
                <div className="col-span-2 text-right">
                  {quotesLoading ? (
                    <div className="h-4 bg-surface-elevated rounded w-16 ml-auto animate-pulse" />
                  ) : (
                    <span className="font-mono text-ivory">
                      {formatPrice(quote?.price)}
                    </span>
                  )}
                </div>

                {/* Day Change */}
                <div className="col-span-2 text-right">
                  {quotesLoading ? (
                    <div className="h-4 bg-surface-elevated rounded w-14 ml-auto animate-pulse" />
                  ) : quote ? (
                    <span className={`font-mono text-sm ${dayPositive ? 'text-positive' : 'text-crimson'}`}>
                      {formatPercent(quote.changePercent)}
                    </span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </div>

                {/* Since Added */}
                <div className="col-span-2 text-right">
                  {gl !== null ? (
                    <div>
                      <span className={`font-mono text-sm ${glPositive ? 'text-positive' : 'text-crimson'}`}>
                        {formatPercent(gl)}
                      </span>
                      <div className="text-[10px] text-text-muted">
                        from {formatPrice(item.added_price)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-text-muted text-sm">--</span>
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-2 text-right">
                  <button
                    onClick={() => removeMutation.mutate(item.id)}
                    disabled={removeMutation.isPending}
                    className="btn-ghost text-text-muted hover:text-crimson p-1.5"
                    title="Remove from watchlist"
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