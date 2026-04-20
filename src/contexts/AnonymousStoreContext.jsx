import { createContext, useContext, useState, useCallback } from 'react'
import { mergeLot } from '../lib/portfolioMath'

const AnonymousStoreContext = createContext(null)

const MAX_ANONYMOUS_TICKERS = 5
const MAX_ANONYMOUS_POSITIONS = 10
const DEFAULT_STATE = 'Arizona'

export function AnonymousStoreProvider({ children }) {
  const [watchlist, setWatchlist] = useState([])
  const [positions, setPositions] = useState([])
  const [state, setState] = useState(DEFAULT_STATE)

  const addTicker = useCallback((ticker) => {
    setWatchlist((prev) => {
      if (prev.find((t) => t.symbol === ticker.symbol)) return prev
      return [{
        id: `anon-${ticker.symbol}-${Date.now()}`,
        symbol: ticker.symbol,
        name: ticker.name || '',
        exchange: ticker.exchange || '',
        added_price: ticker.addedPrice ?? ticker.added_price ?? null,
        created_at: new Date().toISOString(),
      }, ...prev]
    })
  }, [])

  const removeTicker = useCallback((id) => {
    setWatchlist((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Mirrors portfolioApi.add: merges into an existing (symbol, asset_type) lot.
  const addPosition = useCallback((input) => {
    const symbol = (input.symbol || '').toUpperCase()
    const assetType = input.assetType
    const shares = Number(input.shares)
    const costBasisPerShare = Number(input.costBasisPerShare)

    setPositions((prev) => {
      const existing = prev.find(
        (p) => p.symbol === symbol && p.asset_type === assetType
      )
      if (existing) {
        const merged = mergeLot(existing, { shares, costBasisPerShare })
        return prev.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                shares: merged.shares,
                cost_basis_per_share: merged.cost_basis_per_share,
                purchase_date: merged.purchase_date,
                notes: input.notes ?? p.notes,
                updated_at: new Date().toISOString(),
              }
            : p
        )
      }
      if (prev.length >= MAX_ANONYMOUS_POSITIONS) return prev
      const now = new Date().toISOString()
      return [{
        id: `anon-pos-${symbol}-${assetType}-${Date.now()}`,
        symbol,
        name: input.name || '',
        asset_type: assetType,
        shares,
        cost_basis_per_share: costBasisPerShare,
        purchase_date: input.purchaseDate || null,
        notes: input.notes || null,
        created_at: now,
        updated_at: now,
      }, ...prev]
    })
  }, [])

  const updatePosition = useCallback((id, patch) => {
    setPositions((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, ...patch, updated_at: new Date().toISOString() }
          : p
      )
    )
  }, [])

  const removePosition = useCallback((id) => {
    setPositions((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const canAdd = watchlist.length < MAX_ANONYMOUS_TICKERS
  const atCap = watchlist.length >= MAX_ANONYMOUS_TICKERS
  const canAddPosition = positions.length < MAX_ANONYMOUS_POSITIONS
  const atPositionCap = positions.length >= MAX_ANONYMOUS_POSITIONS

  return (
    <AnonymousStoreContext.Provider value={{
      watchlist, addTicker, removeTicker, canAdd, atCap, maxTickers: MAX_ANONYMOUS_TICKERS,
      positions, addPosition, updatePosition, removePosition,
      canAddPosition, atPositionCap, maxPositions: MAX_ANONYMOUS_POSITIONS,
      state, setState,
    }}>
      {children}
    </AnonymousStoreContext.Provider>
  )
}

export function useAnonymousStore() {
  const ctx = useContext(AnonymousStoreContext)
  if (!ctx) throw new Error('useAnonymousStore must be used inside AnonymousStoreProvider')
  return ctx
}
