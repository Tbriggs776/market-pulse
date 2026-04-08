import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { marketApi, stockApi } from '../lib/api'
import { formatCurrency, formatPercent, getChangeColor, formatLargeNumber } from '../lib/utils'

export default function Dashboard() {
  const { data: marketData, isLoading: marketLoading } = useQuery({
    queryKey: ['marketOverview'],
    queryFn: marketApi.getMarketOverview
  })

  const { data: sectorData, isLoading: sectorLoading } = useQuery({
    queryKey: ['sectorPerformance'],
    queryFn: marketApi.getSectorPerformance
  })

  const { data: spyHistory } = useQuery({
    queryKey: ['spyHistory'],
    queryFn: () => stockApi.getHistoricalData('SPY', '1mo')
  })

  const indexNames = {
    SPY: 'S&P 500',
    QQQ: 'NASDAQ 100',
    DIA: 'Dow Jones',
    IWM: 'Russell 2000'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Market overview and key insights</p>
      </div>

      {/* Market Indices */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {marketLoading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))
        ) : marketData?.map((index) => (
          <div key={index.symbol} className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">{indexNames[index.symbol] || index.symbol}</span>
              {index.changePercent >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(index.price)}
            </div>
            <div className={`text-sm font-medium ${getChangeColor(index.changePercent)}`}>
              {formatPercent(index.changePercent)}
            </div>
          </div>
        ))}
      </div>

      {/* Chart and Sectors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* S&P 500 Chart */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">S&P 500 (1 Month)</h2>
          <div className="h-64">
            {spyHistory ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spyHistory}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(val) => `$${val.toFixed(0)}`}
                  />
                  <Tooltip
                    formatter={(val) => [formatCurrency(val), 'Price']}
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                  />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                Loading chart...
              </div>
            )}
          </div>
        </div>

        {/* Sector Performance */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sector Performance</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {sectorLoading ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="flex justify-between items-center animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
              ))
            ) : sectorData?.sort((a, b) => b.changePercent - a.changePercent).map((sector) => (
              <div key={sector.symbol} className="flex justify-between items-center">
                <span className="text-sm text-gray-700">{sector.name}</span>
                <span className={`text-sm font-medium ${getChangeColor(sector.changePercent)}`}>
                  {formatPercent(sector.changePercent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Market Status</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date().getHours() >= 9 && new Date().getHours() < 16 ? 'Open' : 'Closed'}
            </p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Market Sentiment</p>
            <p className="text-lg font-semibold text-gray-900">
              {marketData?.[0]?.changePercent >= 0 ? 'Bullish' : 'Bearish'}
            </p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Activity className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Volatility Index</p>
            <p className="text-lg font-semibold text-gray-900">Moderate</p>
          </div>
        </div>
      </div>
    </div>
  )
}
