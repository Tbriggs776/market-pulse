import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Star,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Search,
  RefreshCw,
  X,
  ExternalLink,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import { watchlistApi } from '../lib/supabase'
import { stockApi, screenerApi } from '../lib/api'
import { formatCurrency, formatPercent, getChangeColor, debounce } from '../lib/utils'

export default function Watchlist() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'symbol', direction: 'asc' })

  // Fetch watchlist from Supabase
  const { data: watchlist, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: watchlistApi.getAll
  })

  // Fetch dividend stock fundamentals
  const { data: dividendStocks } = useQuery({
    queryKey: ['dividendStocks'],
    queryFn: screenerApi.getDividendStocks,
    staleTime: 1000 * 60 * 60 * 6 // 6 hours
  })

  // Create lookup map for fundamentals
  const fundamentalsMap = useMemo(() => {
    if (!dividendStocks) return {}
    return dividendStocks.reduce((acc, stock) => {
      acc[stock.ticker] = stock
      return acc
    }, {})
  }, [dividendStocks])

  // Fetch quotes for watchlist items
  const { data: quotes, isLoading: quotesLoading, refetch: refetchQuotes, isFetching } = useQuery({
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
    staleTime: 1000 * 60 * 60 // 1 hour
  })

  // Search results
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['symbolSearch', searchQuery],
    queryFn: () => stockApi.searchSymbol(searchQuery),
    enabled: searchQuery.length >= 2
  })

  // Add mutation
  const addMutation = useMutation({
    mutationFn: ({ symbol, name }) => watchlistApi.add(symbol, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      setShowModal(false)
      setSearchQuery('')
    }
  })

  // Remove mutation
  const removeMutation = useMutation({
    mutationFn: (id) => watchlistApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    }
  })

  // Enrich watchlist with quotes and fundamentals
  const enrichedWatchlist = useMemo(() => {
    if (!watchlist) return []

    return watchlist.map(item => {
      const quote = quotes?.[item.symbol]
      const fundamentals = fundamentalsMap[item.symbol]

      return {
        ...item,
        price: quote?.price,
        change: quote?.change,
        changePercent: quote?.changePercent,
        sector: fundamentals?.sector || 'Unknown',
        dividendYield: fundamentals?.dividendYield,
        dividendGrowth: fundamentals?.dividendGrowth
      }
    })
  }, [watchlist, quotes, fundamentalsMap])

  // Sort watchlist
  const sortedWatchlist = useMemo(() => {
    return [...enrichedWatchlist].sort((a, b) => {
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]

      // Handle string vs number sorting
      if (typeof aVal === 'string') {
        aVal = aVal?.toLowerCase() || ''
        bVal = bVal?.toLowerCase() || ''
      } else {
        aVal = aVal || 0
        bVal = bVal || 0
      }

      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })
  }, [enrichedWatchlist, sortConfig])

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return null
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  const handleSearch = debounce((value) => {
    setSearchQuery(value)
  }, 300)

  const handleAdd = (result) => {
    addMutation.mutate({ symbol: result.symbol, name: result.name })
  }

  const closeModal = () => {
    setShowModal(false)
    setSearchQuery('')
  }

  // Skeleton row for loading state
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-16"></div></td>
      <td className="p-4 hidden md:table-cell"><div className="h-5 bg-gray-200 rounded w-32"></div></td>
      <td className="p-4 hidden lg:table-cell"><div className="h-5 bg-gray-200 rounded w-24"></div></td>
      <td className="p-4 hidden sm:table-cell"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4 hidden sm:table-cell"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-16"></div></td>
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-20"></div></td>
    </tr>
  )

  // Mobile card component
  const MobileCard = ({ item }) => (
    <div className="card mb-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <Link
              to={`/stock/${item.symbol}`}
              className="font-semibold text-primary-600 hover:underline"
            >
              {item.symbol}
            </Link>
          </div>
          <p className="text-sm text-gray-600 mt-1">{item.name}</p>
          <span className="badge-blue text-xs mt-1">{item.sector}</span>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">
            {item.price ? formatCurrency(item.price) : '-'}
          </div>
          <div className={`text-sm font-medium flex items-center justify-end gap-1 ${getChangeColor(item.changePercent)}`}>
            {item.changePercent >= 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : item.changePercent < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : null}
            {item.changePercent ? formatPercent(item.changePercent) : '-'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-3 border-t border-gray-100">
        <div>
          <span className="text-xs text-gray-500">Yield</span>
          <p className={`font-medium ${item.dividendYield >= 2 ? 'text-green-600' : 'text-gray-900'}`}>
            {item.dividendYield ? `${item.dividendYield.toFixed(2)}%` : '-'}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500">5yr Growth</span>
          <p className={`font-medium ${item.dividendGrowth >= 5 ? 'text-green-600' : 'text-gray-900'}`}>
            {item.dividendGrowth ? `${item.dividendGrowth.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <Link
          to={`/stock/${item.symbol}`}
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          <ExternalLink className="w-4 h-4" />
          View Details
        </Link>
        <button
          onClick={() => removeMutation.mutate(item.id)}
          className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          Remove
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Watchlist</h1>
          <p className="text-gray-600">Track your favorite dividend stocks</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchQuotes()}
            disabled={isFetching}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </button>
        </div>
      </div>

      {/* Add Stock Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Add Stock to Watchlist</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search ticker or company name..."
                  className="input pl-10"
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="mt-4 max-h-64 overflow-y-auto">
                {searchQuery.length < 2 ? (
                  <p className="text-center text-gray-500 py-8">
                    Type at least 2 characters to search
                  </p>
                ) : searchLoading ? (
                  <div className="space-y-2">
                    {Array(3).fill(0).map((_, i) => (
                      <div key={i} className="flex justify-between p-3 animate-pulse">
                        <div className="h-5 bg-gray-200 rounded w-1/3"></div>
                        <div className="h-5 bg-gray-200 rounded w-1/4"></div>
                      </div>
                    ))}
                  </div>
                ) : searchResults?.length > 0 ? (
                  <div className="border rounded-lg divide-y">
                    {searchResults.map((result) => {
                      const alreadyWatched = watchlist?.some(w => w.symbol === result.symbol)
                      return (
                        <button
                          key={result.symbol}
                          onClick={() => !alreadyWatched && handleAdd(result)}
                          disabled={alreadyWatched || addMutation.isPending}
                          className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                            alreadyWatched
                              ? 'bg-gray-50 cursor-not-allowed'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div>
                            <span className="font-medium text-gray-900">{result.symbol}</span>
                            <span className="ml-2 text-sm text-gray-500">{result.name}</span>
                          </div>
                          {alreadyWatched ? (
                            <span className="text-xs text-gray-400">Already watching</span>
                          ) : (
                            <Plus className="w-4 h-4 text-primary-600" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">
                    No results found for "{searchQuery}"
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-xl">
              <p className="text-xs text-gray-500 text-center">
                Or browse stocks from the{' '}
                <Link to="/research" className="text-primary-600 hover:underline" onClick={closeModal}>
                  Research Screener
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {watchlistLoading ? (
        // Loading skeleton - Desktop table
        <div className="card overflow-hidden hidden md:block p-0">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium text-gray-600">Ticker</th>
                <th className="text-left p-4 font-medium text-gray-600">Company</th>
                <th className="text-left p-4 font-medium text-gray-600">Sector</th>
                <th className="text-right p-4 font-medium text-gray-600">Yield</th>
                <th className="text-right p-4 font-medium text-gray-600">5yr Growth</th>
                <th className="text-right p-4 font-medium text-gray-600">Price</th>
                <th className="text-right p-4 font-medium text-gray-600">Change</th>
                <th className="p-4 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Array(5).fill(0).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : sortedWatchlist.length > 0 ? (
        <>
          {/* Mobile Cards */}
          <div className="md:hidden">
            {sortedWatchlist.map(item => (
              <MobileCard key={item.id} item={item} />
            ))}
          </div>

          {/* Desktop Table */}
          <div className="card overflow-hidden hidden md:block p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th
                      className="text-left p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('symbol')}
                    >
                      Ticker <SortIcon columnKey="symbol" />
                    </th>
                    <th className="text-left p-4 font-medium text-gray-600">Company</th>
                    <th
                      className="text-left p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 hidden lg:table-cell"
                      onClick={() => handleSort('sector')}
                    >
                      Sector <SortIcon columnKey="sector" />
                    </th>
                    <th
                      className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 hidden sm:table-cell"
                      onClick={() => handleSort('dividendYield')}
                    >
                      Yield <SortIcon columnKey="dividendYield" />
                    </th>
                    <th
                      className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 hidden sm:table-cell"
                      onClick={() => handleSort('dividendGrowth')}
                    >
                      5yr Growth <SortIcon columnKey="dividendGrowth" />
                    </th>
                    <th
                      className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('price')}
                    >
                      Price <SortIcon columnKey="price" />
                    </th>
                    <th
                      className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('changePercent')}
                    >
                      Change <SortIcon columnKey="changePercent" />
                    </th>
                    <th className="p-4 font-medium text-gray-600 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedWatchlist.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <Link
                            to={`/stock/${item.symbol}`}
                            className="font-semibold text-primary-600 hover:text-primary-800 hover:underline"
                          >
                            {item.symbol}
                          </Link>
                        </div>
                      </td>
                      <td className="p-4 text-gray-700 max-w-[200px] truncate">
                        {item.name}
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="badge-blue text-xs">{item.sector}</span>
                      </td>
                      <td className="p-4 text-right hidden sm:table-cell">
                        <span className={`font-medium ${item.dividendYield >= 2 ? 'text-green-600' : 'text-gray-900'}`}>
                          {item.dividendYield ? `${item.dividendYield.toFixed(2)}%` : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-right hidden sm:table-cell">
                        <span className={`font-medium ${item.dividendGrowth >= 5 ? 'text-green-600' : 'text-gray-900'}`}>
                          {item.dividendGrowth ? `${item.dividendGrowth.toFixed(1)}%` : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium">
                        {item.price ? formatCurrency(item.price) : '-'}
                      </td>
                      <td className={`p-4 text-right ${getChangeColor(item.changePercent)}`}>
                        <div className="flex items-center justify-end gap-1 font-medium">
                          {item.changePercent >= 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : item.changePercent < 0 ? (
                            <TrendingDown className="w-4 h-4" />
                          ) : null}
                          {item.changePercent ? formatPercent(item.changePercent) : '-'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            to={`/stock/${item.symbol}`}
                            className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => removeMutation.mutate(item.id)}
                            disabled={removeMutation.isPending}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from Watchlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        // Empty state
        <div className="card text-center py-16">
          <Star className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No stocks yet</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            Add stocks to your watchlist to track their dividend yields, growth rates, and price changes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Stock
            </button>
            <Link to="/research" className="btn-secondary flex items-center gap-2">
              <Search className="w-4 h-4" />
              Browse Research Screener
            </Link>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {sortedWatchlist.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-sm text-gray-500">Stocks Watching</p>
            <p className="text-2xl font-bold text-gray-900">{sortedWatchlist.length}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Avg Yield</p>
            <p className="text-2xl font-bold text-green-600">
              {sortedWatchlist.filter(s => s.dividendYield).length > 0
                ? `${(sortedWatchlist.reduce((sum, s) => sum + (s.dividendYield || 0), 0) / sortedWatchlist.filter(s => s.dividendYield).length).toFixed(2)}%`
                : '-'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Avg Growth</p>
            <p className="text-2xl font-bold text-gray-900">
              {sortedWatchlist.filter(s => s.dividendGrowth).length > 0
                ? `${(sortedWatchlist.reduce((sum, s) => sum + (s.dividendGrowth || 0), 0) / sortedWatchlist.filter(s => s.dividendGrowth).length).toFixed(1)}%`
                : '-'}
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Gainers / Losers</p>
            <p className="text-2xl font-bold">
              <span className="text-green-600">{sortedWatchlist.filter(s => s.changePercent > 0).length}</span>
              {' / '}
              <span className="text-red-600">{sortedWatchlist.filter(s => s.changePercent < 0).length}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
