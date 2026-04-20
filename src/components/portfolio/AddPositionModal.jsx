import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, AlertTriangle, X, Info,
} from 'lucide-react'
import { stocksService } from '../../lib/api'
import { portfolioApi } from '../../lib/supabase'

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

export default function AddPositionModal({
  open,
  onClose,
  onSuccess,
  presetSymbol,
  presetName,
  presetNotes,
  title = 'Add Position',
}) {
  const queryClient = useQueryClient()

  const [searchTicker, setSearchTicker] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  const [assetType, setAssetType] = useState('stock')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [costMode, setCostMode] = useState('per_share')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [notes, setNotes] = useState('')

  // Existing positions let us show a merge notice when (symbol, assetType) matches.
  const { data: positions = [] } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.list,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const handleLookup = useCallback(async (overrideSymbol) => {
    const raw = (overrideSymbol ?? searchTicker).trim()
    if (!raw) return
    setLookupLoading(true)
    setLookupError('')
    setLookupResult(null)

    const result = await stocksService.lookupTicker(raw)
    if (!result || result.error) {
      setLookupError(result?.error || `Could not find ticker: ${raw}`)
    } else {
      setLookupResult(result)
      if (result.quote?.price != null) {
        setCostBasis((prev) => prev || String(result.quote.price))
      }
    }
    setLookupLoading(false)
  }, [searchTicker])

  // When the modal opens, seed form from presets (or clear it on close).
  // Auto-fire lookup when a preset symbol was provided so cost basis pre-fills.
  useEffect(() => {
    if (open) {
      setSearchTicker(presetSymbol || '')
      setLookupResult(null)
      setLookupError('')
      setAssetType('stock')
      setShares('')
      setCostBasis('')
      setCostMode('per_share')
      setPurchaseDate('')
      setNotes(presetNotes || '')
      if (presetSymbol) {
        handleLookup(presetSymbol)
      }
    }
    // handleLookup is intentionally omitted from deps -- we only auto-fire on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetSymbol, presetNotes])

  const matchingPosition = useMemo(() => {
    if (!lookupResult || !searchTicker) return null
    const sym = searchTicker.trim().toUpperCase()
    return positions.find(
      (p) => p.symbol === sym && p.asset_type === assetType
    ) || null
  }, [lookupResult, searchTicker, assetType, positions])

  const addMutation = useMutation({
    mutationFn: portfolioApi.add,
    onSuccess: (position) => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      onSuccess?.(position)
      onClose?.()
    },
  })

  function handleAdd() {
    if (!lookupResult) return
    const sharesNum = parseFloat(shares)
    const costNum = parseFloat(costBasis)
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) return
    if (!Number.isFinite(costNum) || costNum < 0) return

    const costPerShare = costMode === 'total' ? costNum / sharesNum : costNum

    addMutation.mutate({
      symbol: searchTicker.trim().toUpperCase(),
      name: lookupResult.name || presetName || '',
      assetType,
      shares: sharesNum,
      costBasisPerShare: costPerShare,
      purchaseDate: purchaseDate || null,
      notes: notes.trim() || null,
    })
  }

  if (!open) return null

  return (
    <div className="card-elevated border-gold/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gold uppercase tracking-wide">
          {title}
        </h3>
        <button onClick={onClose} className="btn-ghost p-1">
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
          autoFocus={!presetSymbol}
        />
        <button
          onClick={() => handleLookup()}
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

          {matchingPosition && (
            <div className="flex items-start gap-2 text-xs text-gold bg-gold/5 border border-gold/20 rounded p-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                You already hold {formatShares(matchingPosition.shares)} {ASSET_TYPE_LABEL[matchingPosition.asset_type].toLowerCase()} shares of {matchingPosition.symbol} at an average cost of {formatPrice(matchingPosition.cost_basis_per_share)}. Adding here will average the cost basis and sum the shares.
              </span>
            </div>
          )}

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
  )
}
