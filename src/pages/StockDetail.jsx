import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Eye,
  Share2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Calendar,
  Percent,
  Building2,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts'
import { stockApi, stockDetailApi } from '../lib/api'
import { watchlistApi } from '../lib/supabase'
import { formatCurrency, formatLargeNumber, formatPercent, getChangeColor } from '../lib/utils'

const TABS = ['Fundamentals', 'Dividend History', 'Backtest', 'Narrative']

export default function StockDetail() {
  const { ticker } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('Fundamentals')
  const [narrativeRequested, setNarrativeRequested] = useState(false)

  const upperTicker = ticker?.toUpperCase()

  // Get stock info
  const stockInfo = useMemo(() => stockDetailApi.getStockInfo(upperTicker), [upperTicker])

  // Fetch current quote
  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ['quote', upperTicker],
    queryFn: () => stockApi.getQuote(upperTicker),
    enabled: !!upperTicker,
    staleTime: 1000 * 60 * 5 // 5 minutes
  })

  // Fetch fundamentals
  const { data: fundamentals, isLoading: fundamentalsLoading } = useQuery({
    queryKey: ['fundamentals', upperTicker],
    queryFn: () => stockDetailApi.getFundamentals(upperTicker),
    enabled: !!upperTicker,
    staleTime: 1000 * 60 * 60 // 1 hour
  })

  // Fetch dividend history
  const { data: dividendData, isLoading: dividendLoading } = useQuery({
    queryKey: ['dividendHistory', upperTicker],
    queryFn: () => stockDetailApi.getDividendHistory(upperTicker),
    enabled: !!upperTicker && activeTab === 'Dividend History',
    staleTime: 1000 * 60 * 60 * 24 // 24 hours
  })

  // Fetch backtest data
  const { data: backtestData, isLoading: backtestLoading } = useQuery({
    queryKey: ['backtest', upperTicker],
    queryFn: () => stockDetailApi.getBacktestData(upperTicker),
    enabled: !!upperTicker && activeTab === 'Backtest',
    staleTime: 1000 * 60 * 60 * 24 // 24 hours
  })

  // Fetch narrative (only when requested)
  const { data: narrative, isLoading: narrativeLoading, refetch: fetchNarrative } = useQuery({
    queryKey: ['narrative', upperTicker],
    queryFn: () => stockDetailApi.generateNarrative(upperTicker, fundamentals),
    enabled: !!upperTicker && !!fundamentals && narrativeRequested,
    staleTime: 1000 * 60 * 60 * 24 * 7 // 7 days
  })

  // Check watchlist
  const { data: watchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: watchlistApi.getAll
  })

  const isWatched = useMemo(() => {
    return watchlist?.some(w => w.symbol === upperTicker)
  }, [watchlist, upperTicker])

  // Add to watchlist mutation
  const addToWatchlistMutation = useMutation({
    mutationFn: () => watchlistApi.add(upperTicker, stockInfo.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    }
  })

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({
        title: `${stockInfo.name} (${upperTicker}) - Market Pulse`,
        url
      })
    } else {
      await navigator.clipboard.writeText(url)
      alert('Link copied to clipboard!')
    }
  }

  const handleGenerateNarrative = () => {
    setNarrativeRequested(true)
    if (!narrative) {
      fetchNarrative()
    }
  }

  // Color helpers
  const getMetricColor = (value, thresholds) => {
    if (value >= thresholds.good) return 'text-green-600 bg-green-50'
    if (value >= thresholds.caution) return 'text-yellow-600 bg-yellow-50'
    return 'text-gray-600 bg-gray-50'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link
            to="/research"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Research
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{stockInfo.name}</h1>
            <span className="text-lg font-medium text-gray-500">{upperTicker}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="badge-blue">{stockInfo.sector}</span>
            {quoteLoading ? (
              <span className="h-8 w-24 bg-gray-200 animate-pulse rounded"></span>
            ) : quote ? (
              <>
                <span className="text-2xl font-bold">{formatCurrency(quote.price)}</span>
                <span className={`font-medium ${getChangeColor(quote.changePercent)}`}>
                  {formatPercent(quote.changePercent)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => addToWatchlistMutation.mutate()}
            disabled={isWatched || addToWatchlistMutation.isPending}
            className={`btn-secondary flex items-center gap-2 ${
              isWatched ? 'bg-primary-100 text-primary-700' : ''
            }`}
          >
            <Eye className={`w-4 h-4 ${isWatched ? 'fill-primary-200' : ''}`} />
            {isWatched ? 'Watching' : 'Watch'}
          </button>
          <button onClick={handleShare} className="btn-secondary flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Fundamentals Tab */}
        {activeTab === 'Fundamentals' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {fundamentalsLoading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))
            ) : fundamentals ? (
              <>
                {/* P/E Ratio */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">P/E Ratio</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {fundamentals.peRatio.toFixed(1)}x
                  </div>
                  <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${
                    fundamentals.peRatio < 20 ? 'bg-green-100 text-green-700' :
                      fundamentals.peRatio < 30 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                  }`}>
                    {fundamentals.peRatio < 20 ? 'Value' : fundamentals.peRatio < 30 ? 'Fair' : 'Premium'}
                  </div>
                </div>

                {/* Dividend Yield */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <Percent className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Dividend Yield</span>
                  </div>
                  <div className={`text-2xl font-bold ${fundamentals.dividendYield >= 2 ? 'text-green-600' : 'text-gray-900'}`}>
                    {fundamentals.dividendYield.toFixed(2)}%
                  </div>
                  <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${
                    fundamentals.dividendYield >= 3 ? 'bg-green-100 text-green-700' :
                      fundamentals.dividendYield >= 2 ? 'bg-green-50 text-green-600' :
                        'bg-gray-100 text-gray-600'
                  }`}>
                    {fundamentals.dividendYield >= 3 ? 'High Yield' : fundamentals.dividendYield >= 2 ? 'Good Yield' : 'Low Yield'}
                  </div>
                </div>

                {/* Payout Ratio */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Payout Ratio</span>
                  </div>
                  <div className={`text-2xl font-bold ${fundamentals.payoutRatio > 70 ? 'text-yellow-600' : 'text-gray-900'}`}>
                    {fundamentals.payoutRatio.toFixed(0)}%
                  </div>
                  <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${
                    fundamentals.payoutRatio <= 50 ? 'bg-green-100 text-green-700' :
                      fundamentals.payoutRatio <= 70 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                  }`}>
                    {fundamentals.payoutRatio <= 50 ? 'Safe' : fundamentals.payoutRatio <= 70 ? 'Moderate' : 'High'}
                  </div>
                </div>

                {/* 5-Year Growth */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">5-Year Growth</span>
                  </div>
                  <div className={`text-2xl font-bold ${fundamentals.fiveYearGrowth >= 5 ? 'text-green-600' : 'text-gray-900'}`}>
                    {fundamentals.fiveYearGrowth.toFixed(1)}%
                  </div>
                  <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${
                    fundamentals.fiveYearGrowth >= 8 ? 'bg-green-100 text-green-700' :
                      fundamentals.fiveYearGrowth >= 5 ? 'bg-green-50 text-green-600' :
                        'bg-gray-100 text-gray-600'
                  }`}>
                    {fundamentals.fiveYearGrowth >= 8 ? 'Strong Growth' : fundamentals.fiveYearGrowth >= 5 ? 'Solid Growth' : 'Slow Growth'}
                  </div>
                </div>

                {/* Market Cap */}
                <div className="card">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Market Cap</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatLargeNumber(fundamentals.marketCap)}
                  </div>
                  <div className={`mt-2 text-xs px-2 py-1 rounded-full inline-block ${
                    fundamentals.marketCap >= 200e9 ? 'bg-blue-100 text-blue-700' :
                      fundamentals.marketCap >= 10e9 ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
                  }`}>
                    {fundamentals.marketCap >= 200e9 ? 'Mega Cap' : fundamentals.marketCap >= 10e9 ? 'Large Cap' : 'Mid Cap'}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Dividend History Tab */}
        {activeTab === 'Dividend History' && (
          <div className="space-y-6">
            {/* Chart */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">20-Year Dividend History</h3>
              <div className="h-80">
                {dividendLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  </div>
                ) : dividendData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dividendData.history}>
                      <defs>
                        <linearGradient id="dividendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(year) => year.toString()}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(val) => `$${val.toFixed(2)}`}
                      />
                      <Tooltip
                        formatter={(val) => [`$${val.toFixed(2)}`, 'Annual Dividend']}
                        labelFormatter={(year) => `Year: ${year}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="annualDividend"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        fill="url(#dividendGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>

            {/* Summary Stats */}
            {dividendData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Total Dividends Paid</div>
                  <div className="text-xl font-bold text-gray-900">
                    {formatCurrency(dividendData.summary.totalPaid)}
                  </div>
                  <div className="text-xs text-gray-400">Over {dividendData.summary.yearsOfData} years</div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Dividend CAGR</div>
                  <div className={`text-xl font-bold ${dividendData.summary.cagr >= 5 ? 'text-green-600' : 'text-gray-900'}`}>
                    {dividendData.summary.cagr.toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-400">Compound annual growth</div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Most Recent Annual</div>
                  <div className="text-xl font-bold text-gray-900">
                    {formatCurrency(dividendData.summary.mostRecentAnnual)}
                  </div>
                  <div className="text-xs text-gray-400">Per share (2024)</div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Years of Data</div>
                  <div className="text-xl font-bold text-gray-900">
                    {dividendData.summary.yearsOfData}
                  </div>
                  <div className="text-xs text-gray-400">2004 - 2024</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Backtest Tab */}
        {activeTab === 'Backtest' && (
          <div className="space-y-6">
            {/* Intro */}
            <div className="card bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                If you invested $10,000 in {upperTicker} 10 years ago...
              </h3>
              {backtestLoading ? (
                <div className="h-8 w-48 bg-gray-200 animate-pulse rounded"></div>
              ) : backtestData ? (
                <p className="text-3xl font-bold text-primary-700">
                  You'd have {formatCurrency(backtestData.metrics.finalValue)} today
                </p>
              ) : null}
            </div>

            {/* Metrics Grid */}
            {backtestLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                  </div>
                ))}
              </div>
            ) : backtestData ? (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Total Return</div>
                  <div className={`text-xl font-bold ${backtestData.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(backtestData.metrics.totalReturn)}
                  </div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Annualized Return</div>
                  <div className={`text-xl font-bold ${backtestData.metrics.annualizedReturn >= 8 ? 'text-green-600' : 'text-gray-900'}`}>
                    {backtestData.metrics.annualizedReturn.toFixed(1)}%
                  </div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Max Drawdown</div>
                  <div className={`text-xl font-bold ${backtestData.metrics.maxDrawdown > 30 ? 'text-red-600' : 'text-yellow-600'}`}>
                    -{backtestData.metrics.maxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Sharpe Ratio</div>
                  <div className={`text-xl font-bold ${backtestData.metrics.sharpeRatio >= 1 ? 'text-green-600' : 'text-gray-900'}`}>
                    {backtestData.metrics.sharpeRatio.toFixed(2)}
                  </div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-500 mb-1">Volatility</div>
                  <div className="text-xl font-bold text-gray-900">
                    {backtestData.metrics.volatility.toFixed(1)}%
                  </div>
                </div>
              </div>
            ) : null}

            {/* Performance Chart */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">10-Year Performance</h3>
              <div className="h-80">
                {backtestLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  </div>
                ) : backtestData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={backtestData.chartData.filter((_, i) => i % 3 === 0)}>
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(date) => {
                          const [year, month] = date.split('-')
                          return month === '01' ? year : ''
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(val) => [formatCurrency(val), '']}
                        labelFormatter={(date) => date}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="priceOnly"
                        name="Price Only"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="withDividends"
                        name="With Dividends Reinvested"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Narrative Tab */}
        {activeTab === 'Narrative' && (
          <div className="space-y-6">
            {!narrativeRequested ? (
              <div className="card text-center py-12">
                <Sparkles className="w-12 h-12 text-primary-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Investment Analysis</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Generate a comprehensive investment narrative for {upperTicker} based on fundamentals and current macro conditions.
                </p>
                <button
                  onClick={handleGenerateNarrative}
                  disabled={!fundamentals}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate AI Narrative
                </button>
              </div>
            ) : narrativeLoading ? (
              <div className="card text-center py-12">
                <Loader2 className="w-8 h-8 text-primary-500 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Generating investment narrative...</p>
              </div>
            ) : narrative ? (
              <>
                {/* Title */}
                <div className="card bg-gradient-to-r from-primary-50 to-purple-50 border-primary-200">
                  <h2 className="text-xl font-bold text-gray-900 mb-3">{narrative.title}</h2>
                  <p className="text-gray-700 leading-relaxed">{narrative.summary}</p>
                </div>

                {/* Macro Analysis */}
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Macro Environment</h3>
                  <p className="text-gray-700 leading-relaxed">{narrative.macroAnalysis}</p>
                </div>

                {/* Key Points */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      Key Investment Points
                    </h3>
                    <ul className="space-y-3">
                      {narrative.keyPoints.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-700">
                          <span className="text-green-500 mt-1">+</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      Risk Factors
                    </h3>
                    <ul className="space-y-3">
                      {narrative.risks.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-700">
                          <span className="text-yellow-500 mt-1">!</span>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Conclusion */}
                <div className="card border-l-4 border-primary-500">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Conclusion</h3>
                  <p className="text-gray-700 leading-relaxed">{narrative.conclusion}</p>
                  <p className="text-xs text-gray-400 mt-4">
                    Generated: {new Date(narrative.generatedAt).toLocaleDateString()} (Cached for 7 days)
                  </p>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
