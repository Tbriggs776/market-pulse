import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, Plus, Trash2, TrendingUp, TrendingDown, Search } from 'lucide-react'
import { watchlistApi } from '../lib/supabase'
import { stockApi } from '../lib/api'
import { formatCurrency, formatPercent, getChangeColor, debounce } from '../lib/utils'

export default function Watchlist() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const { data: watchlist, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: watchlistApi.getAll
  })

  const { data: searchResults } = useQuery({
    queryKey: ['symbolSearch', searchQuery],
    queryFn: () => stockApi.searchSymbol(searchQuery),
    enabled: searchQuery.length >= 2
  })

  // Fetch quotes for watchlist items
  const { data: quotes } = useQuery({
    queryKey: ['watchlistQuotes', watchlist?.map(w => w.symbol)],
    queryFn: async () => {
      if (!watchlist || watchlist.length === 0) return {}
      const results = {}
      await Promise.all(
        watchlist.map(async (item) => {
          try {
            const quote = await stockApi.getQuote(item.symbol)
            results[item.symbol] = quote
          } catch (error) {
            results[item.symbol] = null
          }
        })
      )
      return results
    },
    enabled: !!watchlist && watchlist.length > 0,
    refetchInterval: 60000 // Refresh every minute
  })

  const addMutation = useMutation({
    mutationFn: ({ symbol, name }) => watchlistApi.add(symbol, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      setShowSearch(false)
      setSearchQuery('')
    }
  })

  const removeMutation = useMutation({
    mutationFn: (id) => watchlistApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    }
  })

  const handleSearch = debounce((value) => {
    setSearchQuery(value)
  }, 300)

  const handleAdd = (result) => {
    addMutation.mutate({ symbol: result.symbol, name: result.name })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Watchlist</h1>
          <p className="text-gray-600">Track your favorite stocks</p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Stock
        </button>
      </div>

      {/* Search Panel */}
      {showSearch && (
        <div className="card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for a stock to add..."
              className="input pl-10"
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
          </div>

          {searchQuery.length >= 2 && (
            <div className="mt-4 border rounded-lg divide-y max-h-48 overflow-y-auto">
              {searchResults?.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    key={result.symbol}
                    onClick={() => handleAdd(result)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{result.symbol}</span>
                      <span className="ml-2 text-sm text-gray-500">{result.name}</span>
                    </div>
                    <Plus className="w-4 h-4 text-primary-600" />
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-gray-500">No results found</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Watchlist Table */}
      <div className="card overflow-hidden">
        {watchlistLoading ? (
          <div className="space-y-4 p-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex justify-between animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/6"></div>
              </div>
            ))}
          </div>
        ) : watchlist?.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium text-gray-600">Symbol</th>
                <th className="text-left p-4 font-medium text-gray-600">Name</th>
                <th className="text-right p-4 font-medium text-gray-600">Price</th>
                <th className="text-right p-4 font-medium text-gray-600">Change</th>
                <th className="text-right p-4 font-medium text-gray-600">% Change</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {watchlist.map((item) => {
                const quote = quotes?.[item.symbol]
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-medium text-gray-900">{item.symbol}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">{item.name}</td>
                    <td className="p-4 text-right font-medium">
                      {quote ? formatCurrency(quote.price) : '-'}
                    </td>
                    <td className={`p-4 text-right ${quote ? getChangeColor(quote.change) : ''}`}>
                      <div className="flex items-center justify-end gap-1">
                        {quote?.change >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : quote?.change < 0 ? (
                          <TrendingDown className="w-4 h-4" />
                        ) : null}
                        {quote ? formatCurrency(quote.change) : '-'}
                      </div>
                    </td>
                    <td className={`p-4 text-right font-medium ${quote ? getChangeColor(quote.changePercent) : ''}`}>
                      {quote ? formatPercent(quote.changePercent) : '-'}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => removeMutation.mutate(item.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No stocks in watchlist</h3>
            <p className="text-gray-500 mb-4">Add stocks to track their performance</p>
            <button
              onClick={() => setShowSearch(true)}
              className="btn-primary"
            >
              Add Your First Stock
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
