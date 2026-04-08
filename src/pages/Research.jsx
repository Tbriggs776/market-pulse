import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Trash2, ExternalLink } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { stockApi } from '../lib/api'
import { researchApi } from '../lib/supabase'
import { formatCurrency, formatPercent, formatLargeNumber, formatDate, getChangeColor, debounce } from '../lib/utils'

export default function Research() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [noteText, setNoteText] = useState('')

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['symbolSearch', searchQuery],
    queryFn: () => stockApi.searchSymbol(searchQuery),
    enabled: searchQuery.length >= 2
  })

  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ['quote', selectedSymbol],
    queryFn: () => stockApi.getQuote(selectedSymbol),
    enabled: !!selectedSymbol
  })

  const { data: history } = useQuery({
    queryKey: ['history', selectedSymbol],
    queryFn: () => stockApi.getHistoricalData(selectedSymbol, '3mo'),
    enabled: !!selectedSymbol
  })

  const { data: notes } = useQuery({
    queryKey: ['researchNotes'],
    queryFn: researchApi.getAll
  })

  const addNoteMutation = useMutation({
    mutationFn: (note) => researchApi.add(note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['researchNotes'] })
      setNoteText('')
    }
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => researchApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['researchNotes'] })
    }
  })

  const handleSearch = debounce((value) => {
    setSearchQuery(value)
  }, 300)

  const handleAddNote = () => {
    if (!noteText.trim() || !selectedSymbol) return
    addNoteMutation.mutate({
      symbol: selectedSymbol,
      content: noteText,
      created_at: new Date().toISOString()
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Research</h1>
        <p className="text-gray-600">Search and analyze stocks</p>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search for a stock symbol or company name..."
            className="input pl-10"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {/* Search Results */}
        {searchQuery.length >= 2 && (
          <div className="mt-4 border rounded-lg divide-y max-h-48 overflow-y-auto">
            {searchLoading ? (
              <div className="p-4 text-center text-gray-500">Searching...</div>
            ) : searchResults?.length > 0 ? (
              searchResults.map((result) => (
                <button
                  key={result.symbol}
                  onClick={() => {
                    setSelectedSymbol(result.symbol)
                    setSearchQuery('')
                  }}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                >
                  <div>
                    <span className="font-medium text-gray-900">{result.symbol}</span>
                    <span className="ml-2 text-sm text-gray-500">{result.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{result.exchange}</span>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">No results found</div>
            )}
          </div>
        )}
      </div>

      {/* Stock Details */}
      {selectedSymbol && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quote Info */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">{selectedSymbol}</h2>
              <a
                href={`https://finance.yahoo.com/quote/${selectedSymbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
            </div>

            {quoteLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              </div>
            ) : quote ? (
              <>
                <div className="text-3xl font-bold text-gray-900">
                  {formatCurrency(quote.price)}
                </div>
                <div className={`text-lg font-medium ${getChangeColor(quote.changePercent)}`}>
                  {formatCurrency(quote.change)} ({formatPercent(quote.changePercent)})
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Day High</span>
                    <span className="font-medium">{formatCurrency(quote.high)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Day Low</span>
                    <span className="font-medium">{formatCurrency(quote.low)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Volume</span>
                    <span className="font-medium">{formatLargeNumber(quote.volume)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Market Cap</span>
                    <span className="font-medium">{formatLargeNumber(quote.marketCap)}</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Chart */}
          <div className="lg:col-span-2 card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Price History (3 Months)</h2>
            <div className="h-64">
              {history ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
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
        </div>
      )}

      {/* Research Notes */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Research Notes</h2>

        {/* Add Note */}
        {selectedSymbol && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder={`Add a note about ${selectedSymbol}...`}
              className="input flex-1"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
            />
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        )}

        {/* Notes List */}
        <div className="space-y-3">
          {notes?.length > 0 ? (
            notes.map((note) => (
              <div key={note.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="badge-blue mr-2">{note.symbol}</span>
                  <span className="text-gray-700">{note.content}</span>
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDate(note.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => deleteNoteMutation.mutate(note.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 py-4">
              No research notes yet. Search for a stock and add notes.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
