import { createContext, useContext, useState, useCallback } from 'react'

const AnonymousStoreContext = createContext(null)

const MAX_ANONYMOUS_TICKERS = 5

export function AnonymousStoreProvider({ children }) {
  const [watchlist, setWatchlist] = useState([])

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

  const canAdd = watchlist.length < MAX_ANONYMOUS_TICKERS
  const atCap = watchlist.length >= MAX_ANONYMOUS_TICKERS

  return (
    <AnonymousStoreContext.Provider value={{ watchlist, addTicker, removeTicker, canAdd, atCap, maxTickers: MAX_ANONYMOUS_TICKERS }}>
      {children}
    </AnonymousStoreContext.Provider>
  )
}

export function useAnonymousStore() {
  const ctx = useContext(AnonymousStoreContext)
  if (!ctx) throw new Error('useAnonymousStore must be used inside AnonymousStoreProvider')
  return ctx
}