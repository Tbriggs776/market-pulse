import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Eye, Filter, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { screenerApi } from '../lib/api'
import { watchlistApi } from '../lib/supabase'
import { formatCurrency, formatPercent, formatLargeNumber } from '../lib/utils'

export default function Research() {
  const queryClient = useQueryClient()

  // Filter state
  const [filters, setFilters] = useState({
    yieldMin: 0,
    yieldMax: 8,
    dividendGrowth: 0,
    maxPayoutRatio: 60,
    sector: 'all'
  })

  // Sort state
  const [sortConfig, setSortConfig] = useState({ key: 'dividendYield', direction: 'desc' })

  // Mobile filter visibility
  const [showFilters, setShowFilters] = useState(false)

  // Fetch dividend stocks with 6 hour cache
  const { data: stocks, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dividendStocks'],
    queryFn: screenerApi.getDividendStocks,
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
    cacheTime: 1000 * 60 * 60 * 12 // 12 hours
  })

  // Get watchlist to check if stock is already watched
  const { data: watchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: watchlistApi.getAll
  })

  const watchedSymbols = useMemo(() => {
    return new Set(watchlist?.map(w => w.symbol) || [])
  }, [watchlist])

  // Add to watchlist mutation
  const addToWatchlistMutation = useMutation({
    mutationFn: ({ symbol, name }) => watchlistApi.add(symbol, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    }
  })

  // Get unique sectors
  const sectors = useMemo(() => screenerApi.getSectors(), [])

  // Filter and sort stocks
  const filteredStocks = useMemo(() => {
    if (!stocks) return []

    return stocks
      .filter(stock => {
        // Yield range filter
        if (stock.dividendYield < filters.yieldMin || stock.dividendYield > filters.yieldMax) {
          return false
        }
        // Dividend growth filter
        if (stock.dividendGrowth < filters.dividendGrowth) {
          return false
        }
        // Payout ratio filter
        if (stock.payoutRatio > filters.maxPayoutRatio) {
          return false
        }
        // Sector filter
        if (filters.sector !== 'all' && stock.sector !== filters.sector) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        const aVal = a[sortConfig.key] || 0
        const bVal = b[sortConfig.key] || 0
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
  }, [stocks, filters, sortConfig])

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
  }

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return null
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />
  }

  const handleAddToWatchlist = (stock) => {
    if (!watchedSymbols.has(stock.ticker)) {
      addToWatchlistMutation.mutate({ symbol: stock.ticker, name: stock.name })
    }
  }

  // Skeleton loader component
  const SkeletonRow = () => (
    <tr className="animate-pulse">
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-16"></div></td>
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-32"></div></td>
      <td className="p-4 hidden md:table-cell"><div className="h-5 bg-gray-200 rounded w-24"></div></td>
      <td className="p-4"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4 hidden sm:table-cell"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4 hidden lg:table-cell"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4 hidden md:table-cell"><div className="h-5 bg-gray-200 rounded w-14"></div></td>
      <td className="p-4"><div className="h-8 bg-gray-200 rounded w-8"></div></td>
    </tr>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Research Screener</h1>
          <p className="text-gray-600">Filter dividend stocks by yield, growth, and fundamentals</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters - Mobile Toggle */}
      <button
        className="md:hidden w-full btn-secondary flex items-center justify-center gap-2"
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter className="w-4 h-4" />
        {showFilters ? 'Hide Filters' : 'Show Filters'}
      </button>

      {/* Filters */}
      <div className={`card ${showFilters ? 'block' : 'hidden'} md:block`}>
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Filters</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Yield Range Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dividend Yield: {filters.yieldMin.toFixed(1)}% - {filters.yieldMax.toFixed(1)}%
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">Min</span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="0.5"
                  value={filters.yieldMin}
                  onChange={(e) => setFilters(f => ({
                    ...f,
                    yieldMin: Math.min(parseFloat(e.target.value), f.yieldMax - 0.5)
                  }))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">Max</span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="0.5"
                  value={filters.yieldMax}
                  onChange={(e) => setFilters(f => ({
                    ...f,
                    yieldMax: Math.max(parseFloat(e.target.value), f.yieldMin + 0.5)
                  }))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
              </div>
            </div>
          </div>

          {/* Dividend Growth */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Dividend Growth (5yr): {filters.dividendGrowth.toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={filters.dividendGrowth}
              onChange={(e) => setFilters(f => ({ ...f, dividendGrowth: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>15%</span>
            </div>
          </div>

          {/* Payout Ratio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Payout Ratio: {filters.maxPayoutRatio}%
            </label>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={filters.maxPayoutRatio}
              onChange={(e) => setFilters(f => ({ ...f, maxPayoutRatio: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>20%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Sector Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sector
            </label>
            <select
              value={filters.sector}
              onChange={(e) => setFilters(f => ({ ...f, sector: e.target.value }))}
              className="input"
            >
              <option value="all">All Sectors</option>
              {sectors.map(sector => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Summary */}
        <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Showing:</span>
          <span className="badge-blue">
            {filteredStocks.length} of {stocks?.length || 0} stocks
          </span>
          {filters.sector !== 'all' && (
            <span className="badge-green">{filters.sector}</span>
          )}
          {filters.yieldMin > 0 && (
            <span className="badge-yellow">Yield &gt; {filters.yieldMin}%</span>
          )}
          {filters.dividendGrowth > 0 && (
            <span className="badge-yellow">Growth &gt; {filters.dividendGrowth}%</span>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th
                  className="text-left p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('ticker')}
                >
                  Ticker <SortIcon columnKey="ticker" />
                </th>
                <th className="text-left p-4 font-medium text-gray-600">Company</th>
                <th className="text-left p-4 font-medium text-gray-600 hidden md:table-cell">Sector</th>
                <th
                  className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dividendYield')}
                >
                  Yield <SortIcon columnKey="dividendYield" />
                </th>
                <th
                  className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 hidden sm:table-cell"
                  onClick={() => handleSort('dividendGrowth')}
                >
                  Growth <SortIcon columnKey="dividendGrowth" />
                </th>
                <th
                  className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 hidden lg:table-cell"
                  onClick={() => handleSort('payoutRatio')}
                >
                  Payout <SortIcon columnKey="payoutRatio" />
                </th>
                <th
                  className="text-right p-4 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 hidden md:table-cell"
                  onClick={() => handleSort('peRatio')}
                >
                  P/E <SortIcon columnKey="peRatio" />
                </th>
                <th className="p-4 font-medium text-gray-600 text-center">Watch</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                // Skeleton loaders
                Array(10).fill(0).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredStocks.length > 0 ? (
                filteredStocks.map((stock) => (
                  <tr key={stock.ticker} className="hover:bg-gray-50">
                    <td className="p-4">
                      <Link
                        to={`/stock/${stock.ticker}`}
                        className="font-semibold text-primary-600 hover:text-primary-800 hover:underline"
                      >
                        {stock.ticker}
                      </Link>
                    </td>
                    <td className="p-4">
                      <span className="text-gray-900">{stock.name}</span>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <span className="text-sm text-gray-600">{stock.sector}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-medium ${stock.dividendYield >= 3 ? 'text-green-600' : 'text-gray-900'}`}>
                        {stock.dividendYield.toFixed(2)}%
                      </span>
                    </td>
                    <td className="p-4 text-right hidden sm:table-cell">
                      <span className={`font-medium ${stock.dividendGrowth >= 7 ? 'text-green-600' : 'text-gray-900'}`}>
                        {stock.dividendGrowth.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-4 text-right hidden lg:table-cell">
                      <span className={`font-medium ${stock.payoutRatio > 70 ? 'text-yellow-600' : 'text-gray-900'}`}>
                        {stock.payoutRatio.toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-4 text-right hidden md:table-cell">
                      <span className="text-gray-900">{stock.peRatio.toFixed(1)}</span>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleAddToWatchlist(stock)}
                        disabled={watchedSymbols.has(stock.ticker) || addToWatchlistMutation.isPending}
                        className={`p-2 rounded-lg transition-colors ${
                          watchedSymbols.has(stock.ticker)
                            ? 'bg-primary-100 text-primary-600 cursor-default'
                            : 'hover:bg-gray-100 text-gray-400 hover:text-primary-600'
                        }`}
                        title={watchedSymbols.has(stock.ticker) ? 'Already watching' : 'Add to watchlist'}
                      >
                        <Eye className={`w-5 h-5 ${watchedSymbols.has(stock.ticker) ? 'fill-primary-200' : ''}`} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-medium">No stocks match your filters</p>
                    <p className="text-sm mt-1">Try adjusting your filter criteria</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="card bg-gray-50">
        <h3 className="font-medium text-gray-900 mb-2">Column Guide</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">Yield:</span> Annual dividend yield %
          </div>
          <div>
            <span className="font-medium">Growth:</span> 5-year dividend growth rate
          </div>
          <div>
            <span className="font-medium">Payout:</span> Dividend payout ratio
          </div>
          <div>
            <span className="font-medium">P/E:</span> Price-to-earnings ratio
          </div>
        </div>
      </div>
    </div>
  )
}
