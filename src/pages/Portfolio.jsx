import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Plus, Trash2, Edit2, X, Check, TrendingUp, TrendingDown } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { portfolioApi } from '../lib/supabase'
import { stockApi } from '../lib/api'
import { formatCurrency, formatPercent, getChangeColor, calculatePortfolioMetrics } from '../lib/utils'

const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6']

export default function Portfolio() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ symbol: '', shares: '', avg_cost: '' })

  const { data: holdings, isLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.getAll
  })

  // Fetch current prices for holdings
  const { data: prices } = useQuery({
    queryKey: ['portfolioPrices', holdings?.map(h => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return {}
      const results = {}
      await Promise.all(
        holdings.map(async (holding) => {
          try {
            const quote = await stockApi.getQuote(holding.symbol)
            results[holding.symbol] = quote.price
          } catch (error) {
            results[holding.symbol] = holding.avg_cost
          }
        })
      )
      return results
    },
    enabled: !!holdings && holdings.length > 0
  })

  const addMutation = useMutation({
    mutationFn: (holding) => portfolioApi.add(holding),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setShowAddForm(false)
      setFormData({ symbol: '', shares: '', avg_cost: '' })
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }) => portfolioApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      setEditingId(null)
    }
  })

  const removeMutation = useMutation({
    mutationFn: (id) => portfolioApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    }
  })

  // Calculate holdings with current prices
  const enrichedHoldings = holdings?.map(h => ({
    ...h,
    current_price: prices?.[h.symbol] || h.avg_cost,
    market_value: (prices?.[h.symbol] || h.avg_cost) * h.shares,
    cost_basis: h.avg_cost * h.shares,
    gain: ((prices?.[h.symbol] || h.avg_cost) - h.avg_cost) * h.shares,
    gainPercent: ((prices?.[h.symbol] || h.avg_cost) - h.avg_cost) / h.avg_cost * 100
  }))

  const metrics = calculatePortfolioMetrics(enrichedHoldings?.map(h => ({
    ...h,
    current_price: h.current_price
  })))

  // Pie chart data
  const pieData = enrichedHoldings?.map(h => ({
    name: h.symbol,
    value: h.market_value
  })) || []

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        updates: {
          symbol: formData.symbol.toUpperCase(),
          shares: parseFloat(formData.shares),
          avg_cost: parseFloat(formData.avg_cost)
        }
      })
    } else {
      addMutation.mutate({
        symbol: formData.symbol.toUpperCase(),
        shares: parseFloat(formData.shares),
        avg_cost: parseFloat(formData.avg_cost)
      })
    }
  }

  const startEdit = (holding) => {
    setEditingId(holding.id)
    setFormData({
      symbol: holding.symbol,
      shares: holding.shares.toString(),
      avg_cost: holding.avg_cost.toString()
    })
    setShowAddForm(true)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFormData({ symbol: '', shares: '', avg_cost: '' })
    setShowAddForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
          <p className="text-gray-600">Track your investments</p>
        </div>
        <button
          onClick={() => {
            cancelEdit()
            setShowAddForm(!showAddForm)
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Holding
        </button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Total Value</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.totalValue)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Total Cost</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(metrics.totalCost)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Total Gain/Loss</p>
          <p className={`text-2xl font-bold ${getChangeColor(metrics.totalGain)}`}>
            {formatCurrency(metrics.totalGain)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500 mb-1">Return</p>
          <p className={`text-2xl font-bold ${getChangeColor(metrics.totalGainPercent)}`}>
            {formatPercent(metrics.totalGainPercent)}
          </p>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {editingId ? 'Edit Holding' : 'Add New Holding'}
            </h2>
            <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
              <input
                type="text"
                className="input"
                placeholder="AAPL"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Shares</label>
              <input
                type="number"
                step="0.0001"
                className="input"
                placeholder="100"
                value={formData.shares}
                onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                required
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Avg Cost</label>
              <input
                type="number"
                step="0.01"
                className="input"
                placeholder="150.00"
                value={formData.avg_cost}
                onChange={(e) => setFormData({ ...formData, avg_cost: e.target.value })}
                required
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                {editingId ? 'Update' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Portfolio Chart and Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Allocation</h2>
          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No holdings to display
            </div>
          )}
          {/* Legend */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-gray-700">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Holdings Table */}
        <div className="lg:col-span-2 card overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Holdings</h2>
          {isLoading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <div key={i} className="flex justify-between animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-6 bg-gray-200 rounded w-1/6"></div>
                </div>
              ))}
            </div>
          ) : enrichedHoldings?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600">Symbol</th>
                    <th className="text-right p-3 font-medium text-gray-600">Shares</th>
                    <th className="text-right p-3 font-medium text-gray-600">Avg Cost</th>
                    <th className="text-right p-3 font-medium text-gray-600">Price</th>
                    <th className="text-right p-3 font-medium text-gray-600">Value</th>
                    <th className="text-right p-3 font-medium text-gray-600">Gain/Loss</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enrichedHoldings.map((holding) => (
                    <tr key={holding.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-primary-500" />
                          <span className="font-medium">{holding.symbol}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">{holding.shares.toLocaleString()}</td>
                      <td className="p-3 text-right">{formatCurrency(holding.avg_cost)}</td>
                      <td className="p-3 text-right">{formatCurrency(holding.current_price)}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(holding.market_value)}</td>
                      <td className={`p-3 text-right ${getChangeColor(holding.gain)}`}>
                        <div className="flex items-center justify-end gap-1">
                          {holding.gain >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          <span>{formatCurrency(holding.gain)}</span>
                          <span className="text-xs">({formatPercent(holding.gainPercent)})</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(holding)}
                            className="text-gray-400 hover:text-primary-500"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeMutation.mutate(holding.id)}
                            className="text-gray-400 hover:text-red-500"
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
          ) : (
            <div className="text-center py-8">
              <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No holdings yet</h3>
              <p className="text-gray-500">Add your first investment to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
