import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { computePositions } from '../lib/positionEngine'

const AnonymousStoreContext = createContext(null)

const MAX_ANONYMOUS_TICKERS = 5
const MAX_ANONYMOUS_TRANSACTIONS = 20
const DEFAULT_STATE = 'Arizona'

export function AnonymousStoreProvider({ children }) {
  const [watchlist, setWatchlist] = useState([])
  const [transactions, setTransactions] = useState([])
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

  // Transactions are the source of truth; positions are derived.
  const addTransaction = useCallback((input) => {
    const now = new Date().toISOString()
    setTransactions((prev) => {
      if (prev.length >= MAX_ANONYMOUS_TRANSACTIONS) return prev
      return [{
        id: `anon-txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        symbol: (input.symbol || '').toUpperCase(),
        name: input.name || '',
        asset_type: input.assetType || 'stock',
        transaction_type: input.transactionType || 'buy',
        shares: input.shares != null ? Number(input.shares) : null,
        price_per_share: input.pricePerShare != null ? Number(input.pricePerShare) : null,
        total_amount: input.totalAmount != null ? Number(input.totalAmount) : null,
        occurred_at: input.occurredAt || now.slice(0, 10),
        notes: input.notes || null,
        source: input.source || 'manual',
        created_at: now,
        updated_at: now,
      }, ...prev]
    })
  }, [])

  const removeTransaction = useCallback((id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const positions = useMemo(() => computePositions(transactions), [transactions])

  const canAdd = watchlist.length < MAX_ANONYMOUS_TICKERS
  const atCap = watchlist.length >= MAX_ANONYMOUS_TICKERS
  const canAddTransaction = transactions.length < MAX_ANONYMOUS_TRANSACTIONS
  const atTransactionCap = transactions.length >= MAX_ANONYMOUS_TRANSACTIONS

  return (
    <AnonymousStoreContext.Provider value={{
      watchlist, addTicker, removeTicker, canAdd, atCap, maxTickers: MAX_ANONYMOUS_TICKERS,
      transactions, addTransaction, removeTransaction,
      canAddTransaction, atTransactionCap, maxTransactions: MAX_ANONYMOUS_TRANSACTIONS,
      positions,
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
