import { useQuery } from '@tanstack/react-query'
import { Landmark, User, Calendar, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { governmentApi } from '../lib/api'
import { formatDate } from '../lib/utils'

export default function Government() {
  const { data: congressTrades, isLoading } = useQuery({
    queryKey: ['congressTrading'],
    queryFn: governmentApi.getCongressTrading,
    staleTime: 1000 * 60 * 30 // 30 minutes
  })

  const getPartyColor = (party) => {
    if (party?.toLowerCase().includes('republican') || party === 'R') {
      return 'bg-red-100 text-red-800'
    }
    if (party?.toLowerCase().includes('democrat') || party === 'D') {
      return 'bg-blue-100 text-blue-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  const getTransactionType = (type) => {
    const lowerType = type?.toLowerCase() || ''
    if (lowerType.includes('purchase') || lowerType.includes('buy')) {
      return { label: 'Buy', color: 'text-green-600', icon: ArrowUpRight }
    }
    if (lowerType.includes('sale') || lowerType.includes('sell')) {
      return { label: 'Sell', color: 'text-red-600', icon: ArrowDownRight }
    }
    return { label: type, color: 'text-gray-600', icon: null }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Government Trading</h1>
        <p className="text-gray-600">Track congressional stock transactions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Landmark className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Transactions</p>
            <p className="text-lg font-semibold text-gray-900">
              {congressTrades?.length || 0}
            </p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <ArrowUpRight className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Purchases</p>
            <p className="text-lg font-semibold text-gray-900">
              {congressTrades?.filter(t =>
                t.type?.toLowerCase().includes('purchase')
              ).length || 0}
            </p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-lg">
            <ArrowDownRight className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Sales</p>
            <p className="text-lg font-semibold text-gray-900">
              {congressTrades?.filter(t =>
                t.type?.toLowerCase().includes('sale')
              ).length || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card overflow-hidden">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h2>

        {isLoading ? (
          <div className="space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex justify-between animate-pulse p-4 bg-gray-50 rounded-lg">
                <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/6"></div>
              </div>
            ))}
          </div>
        ) : congressTrades?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-600">Representative</th>
                  <th className="text-left p-4 font-medium text-gray-600">Party</th>
                  <th className="text-left p-4 font-medium text-gray-600">Ticker</th>
                  <th className="text-left p-4 font-medium text-gray-600">Transaction</th>
                  <th className="text-left p-4 font-medium text-gray-600">Amount</th>
                  <th className="text-left p-4 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {congressTrades.map((trade, index) => {
                  const txType = getTransactionType(trade.type)
                  const TxIcon = txType.icon
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-gray-100 rounded-full">
                            <User className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="font-medium text-gray-900">
                            {trade.representative}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPartyColor(trade.party)}`}>
                          {trade.party}
                        </span>
                      </td>
                      <td className="p-4">
                        {trade.ticker ? (
                          <span className="font-medium text-primary-600">{trade.ticker}</span>
                        ) : (
                          <span className="text-gray-400 text-sm">{trade.asset_description?.slice(0, 30)}...</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className={`flex items-center gap-1 ${txType.color}`}>
                          {TxIcon && <TxIcon className="w-4 h-4" />}
                          <span className="font-medium">{txType.label}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-gray-700">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span>{trade.amount}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{formatDate(trade.transaction_date)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No trading data available</h3>
            <p className="text-gray-500">Check back later for congressional trading updates</p>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Landmark className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-blue-900">About This Data</h3>
            <p className="text-sm text-blue-700 mt-1">
              Members of Congress are required to disclose stock transactions within 45 days under the STOCK Act.
              This data is sourced from public filings and may have a delay of several weeks.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
