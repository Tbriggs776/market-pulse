import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, RefreshCw, AlertTriangle, X, Check,
  Receipt, TrendingUp, TrendingDown, Coins, Search,
} from 'lucide-react'
import { transactionsApi } from '../lib/supabase'

const TRANSACTION_TYPES = [
  { value: 'buy', label: 'Buy', icon: TrendingUp, color: 'text-positive' },
  { value: 'sell', label: 'Sell', icon: TrendingDown, color: 'text-crimson' },
  { value: 'dividend', label: 'Dividend', icon: Coins, color: 'text-gold' },
]

const ASSET_TYPES = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual_fund', label: 'Mutual Fund' },
]

const LOT_METHODS = [
  { value: '', label: 'Default for asset type' },
  { value: 'fifo', label: 'FIFO — oldest first' },
  { value: 'lifo', label: 'LIFO — newest first' },
  { value: 'hifo', label: 'HIFO — highest cost first' },
  { value: 'average_cost', label: 'Average cost' },
]

const TYPE_META = {
  buy: { label: 'Buy', color: 'text-positive', bg: 'bg-positive/10' },
  sell: { label: 'Sell', color: 'text-crimson', bg: 'bg-crimson/10' },
  dividend: { label: 'Dividend', color: 'text-gold', bg: 'bg-gold/10' },
}

const ASSET_LABEL = {
  stock: 'Stock',
  etf: 'ETF',
  mutual_fund: 'Mutual Fund',
}

const EMPTY_FORM = {
  type: 'buy',
  symbol: '',
  name: '',
  assetType: 'stock',
  shares: '',
  pricePerShare: '',
  totalAmount: '',
  occurredAt: new Date().toISOString().slice(0, 10),
  lotMethod: '',
  notes: '',
}

function formatPrice(n) {
  if (n == null) return '--'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatShares(n) {
  if (n == null) return '--'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 })
}
function formatDate(d) {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSymbol = searchParams.get('symbol') || ''

  const [symbolFilter, setSymbolFilter] = useState(urlSymbol.toUpperCase())
  const [typeFilter, setTypeFilter] = useState('all')
  const [formMode, setFormMode] = useState(null) // 'add' | 'edit' | null
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  // Keep URL in sync when the user edits the filter -- supports deep-linking
  // back from the Portfolio page and bookmarking filtered views.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (symbolFilter) next.set('symbol', symbolFilter)
    else next.delete('symbol')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolFilter])

  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  const filtered = useMemo(() => {
    const sym = symbolFilter.trim().toUpperCase()
    return transactions.filter((t) => {
      if (sym && t.symbol !== sym) return false
      if (typeFilter !== 'all' && t.transaction_type !== typeFilter) return false
      return true
    })
  }, [transactions, symbolFilter, typeFilter])

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['portfolio'] })
  }

  const addMutation = useMutation({
    mutationFn: transactionsApi.add,
    onSuccess: () => {
      invalidateAll()
      closeForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }) => transactionsApi.update(id, patch),
    onSuccess: () => {
      invalidateAll()
      closeForm()
    },
  })

  const removeMutation = useMutation({
    mutationFn: transactionsApi.remove,
    onSuccess: invalidateAll,
  })

  function openAddForm() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, symbol: symbolFilter || '' })
    setFormError('')
    setFormMode('add')
  }

  function openEditForm(txn) {
    setEditingId(txn.id)
    setForm({
      type: txn.transaction_type,
      symbol: txn.symbol || '',
      name: txn.name || '',
      assetType: txn.asset_type || 'stock',
      shares: txn.shares != null ? String(txn.shares) : '',
      pricePerShare: txn.price_per_share != null ? String(txn.price_per_share) : '',
      totalAmount: txn.total_amount != null ? String(txn.total_amount) : '',
      occurredAt: txn.occurred_at || new Date().toISOString().slice(0, 10),
      lotMethod: txn.lot_method || '',
      notes: txn.notes || '',
    })
    setFormError('')
    setFormMode('edit')
  }

  function closeForm() {
    setFormMode(null)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  function validateForm() {
    if (!form.symbol.trim()) return 'Symbol required'
    if (!form.occurredAt) return 'Date required'
    if (form.type === 'dividend') {
      const amt = parseFloat(form.totalAmount)
      if (!Number.isFinite(amt) || amt <= 0) return 'Dividend amount must be > 0'
    } else {
      const sh = parseFloat(form.shares)
      const pr = parseFloat(form.pricePerShare)
      if (!Number.isFinite(sh) || sh <= 0) return 'Shares must be > 0'
      if (!Number.isFinite(pr) || pr < 0) return 'Price must be >= 0'
    }
    return null
  }

  function handleSave() {
    const err = validateForm()
    if (err) {
      setFormError(err)
      return
    }
    const base = {
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim() || null,
      assetType: form.assetType,
      transactionType: form.type,
      occurredAt: form.occurredAt,
      notes: form.notes.trim() || null,
    }
    if (form.type === 'dividend') {
      base.shares = null
      base.pricePerShare = null
      base.totalAmount = parseFloat(form.totalAmount)
    } else {
      base.shares = parseFloat(form.shares)
      base.pricePerShare = parseFloat(form.pricePerShare)
      base.totalAmount = base.shares * base.pricePerShare
    }
    if (form.type === 'sell' && form.lotMethod) {
      base.lotMethod = form.lotMethod
    }

    if (formMode === 'edit' && editingId) {
      // Update surface takes a patch; map flat fields to the API shape.
      updateMutation.mutate({
        id: editingId,
        patch: {
          transactionType: base.transactionType,
          shares: base.shares,
          pricePerShare: base.pricePerShare,
          totalAmount: base.totalAmount,
          occurredAt: base.occurredAt,
          notes: base.notes,
        },
      })
    } else {
      addMutation.mutate(base)
    }
  }

  const pending = addMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Transactions
          </h1>
          <p className="text-sm text-text-secondary">
            {transactions.length} {transactions.length === 1 ? 'record' : 'records'} on file
            {filtered.length !== transactions.length && (
              <span className="text-text-muted"> · {filtered.length} shown</span>
            )}
          </p>
        </div>
        <button onClick={openAddForm} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Filter bar */}
      <div className="card flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
            placeholder="Filter by symbol (e.g. NVDA)"
            className="input w-full font-mono pl-9"
            maxLength={10}
          />
        </div>
        <div className="flex items-center gap-1 bg-surface rounded-md border border-border p-0.5">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded text-[11px] transition-colors ${typeFilter === 'all' ? 'bg-gold/15 text-gold-bright' : 'text-text-secondary hover:text-ivory'}`}
          >
            All
          </button>
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`flex items-center gap-1 px-3 py-1 rounded text-[11px] transition-colors ${typeFilter === t.value ? 'bg-gold/15 text-gold-bright' : 'text-text-secondary hover:text-ivory'}`}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
        {(symbolFilter || typeFilter !== 'all') && (
          <button
            onClick={() => { setSymbolFilter(''); setTypeFilter('all') }}
            className="btn-ghost text-xs"
          >
            Clear
          </button>
        )}
      </div>

      {/* Add / edit form */}
      {formMode && (
        <TransactionForm
          form={form}
          setForm={setForm}
          mode={formMode}
          pending={pending}
          error={formError || addMutation.error?.message || updateMutation.error?.message}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}

      {/* List states */}
      {error && (
        <div className="card border-crimson/30">
          <div className="flex items-center gap-2 text-crimson text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error.message || 'Failed to load transactions'}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-surface-elevated rounded w-32 mb-2" />
              <div className="h-3 bg-surface-elevated rounded w-48" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && transactions.length === 0 && (
        <div className="card text-center py-16">
          <Receipt className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-ivory mb-2">No transactions yet</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">
            Buys, sells, and dividends appear here as you record them.
            Positions on the Portfolio page are computed from this history.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={openAddForm} className="btn-primary">
              <Plus className="w-4 h-4" /> Record Transaction
            </button>
            <Link to="/portfolio" className="btn-secondary">
              Go to Portfolio
            </Link>
          </div>
        </div>
      )}

      {!isLoading && transactions.length > 0 && filtered.length === 0 && (
        <div className="card text-center py-10 text-sm text-text-muted">
          No transactions match the current filters.
        </div>
      )}

      {/* Transaction list */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
            <div className="col-span-2">Date</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-3">Symbol</div>
            <div className="col-span-2 text-right">Shares</div>
            <div className="col-span-2 text-right">Price / Amount</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {filtered.map((t) => {
            const meta = TYPE_META[t.transaction_type] || TYPE_META.buy
            const isDividend = t.transaction_type === 'dividend'
            return (
              <div
                key={t.id}
                className="card grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center hover:border-gold-dim transition-colors"
              >
                <div className="sm:col-span-2">
                  <div className="text-sm text-ivory font-mono">
                    {formatDate(t.occurred_at)}
                  </div>
                  {t.source && t.source !== 'manual' && (
                    <div className="text-[10px] text-text-muted">{t.source}</div>
                  )}
                </div>

                <div className="sm:col-span-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${meta.bg} ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="sm:col-span-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-ivory">{t.symbol}</span>
                    <span className="text-[9px] uppercase tracking-wide text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded">
                      {ASSET_LABEL[t.asset_type] || t.asset_type}
                    </span>
                    {t.lot_method && (
                      <span className="text-[9px] uppercase tracking-wide text-gold bg-gold/5 border border-gold/20 px-1.5 py-0.5 rounded">
                        {t.lot_method}
                      </span>
                    )}
                  </div>
                  {(t.name || t.notes) && (
                    <div className="text-xs text-text-secondary truncate">
                      {t.name || ''}
                      {t.name && t.notes ? ' · ' : ''}
                      {t.notes && <span className="italic">{t.notes}</span>}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2 sm:text-right">
                  {isDividend ? (
                    <span className="text-text-muted text-sm">--</span>
                  ) : (
                    <span className="font-mono text-ivory text-sm">
                      {formatShares(t.shares)}
                    </span>
                  )}
                </div>

                <div className="sm:col-span-2 sm:text-right">
                  {isDividend ? (
                    <span className="font-mono text-gold text-sm">
                      {formatPrice(t.total_amount)}
                    </span>
                  ) : (
                    <>
                      <div className="font-mono text-ivory text-sm">
                        {formatPrice(t.price_per_share)}
                      </div>
                      <div className="text-[10px] text-text-muted font-mono">
                        {formatPrice(t.total_amount)}
                      </div>
                    </>
                  )}
                </div>

                <div className="sm:col-span-2 flex items-center justify-end gap-1">
                  <button
                    onClick={() => openEditForm(t)}
                    className="btn-ghost p-1.5 text-text-secondary hover:text-ivory"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete this ${meta.label.toLowerCase()} of ${t.symbol}? Positions will recompute.`)) {
                        removeMutation.mutate(t.id)
                      }
                    }}
                    disabled={removeMutation.isPending}
                    className="btn-ghost p-1.5 text-text-muted hover:text-crimson"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TransactionForm({ form, setForm, mode, pending, error, onSave, onCancel }) {
  const isDividend = form.type === 'dividend'
  const isSell = form.type === 'sell'

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="card-elevated border-gold/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gold uppercase tracking-wide">
          {mode === 'edit' ? 'Edit Transaction' : 'Add Transaction'}
        </h3>
        <button onClick={onCancel} className="btn-ghost p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Type selector */}
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
          Transaction Type
        </label>
        <div className="flex gap-2">
          {TRANSACTION_TYPES.map((t) => {
            const active = form.type === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => updateField('type', t.value)}
                disabled={mode === 'edit'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-gold/10 text-gold border-gold/40'
                    : 'bg-surface-elevated text-text-secondary border-border hover:text-ivory'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
        {mode === 'edit' && (
          <div className="text-[10px] text-text-muted mt-1">
            Type can't be changed on an existing record. Delete and re-add if needed.
          </div>
        )}
      </div>

      {/* Symbol + Asset type */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
            Symbol
          </label>
          <input
            type="text"
            value={form.symbol}
            onChange={(e) => updateField('symbol', e.target.value.toUpperCase())}
            placeholder="NVDA"
            className="input w-full font-mono"
            maxLength={10}
            disabled={mode === 'edit'}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
            Asset Type
          </label>
          <div className="flex gap-2">
            {ASSET_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => updateField('assetType', t.value)}
                disabled={mode === 'edit'}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                  form.assetType === t.value
                    ? 'bg-gold/10 text-gold border-gold/40'
                    : 'bg-surface-elevated text-text-secondary border-border hover:text-ivory'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Buy/Sell: shares + price. Dividend: total amount. */}
      {!isDividend && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
              Shares
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={form.shares}
              onChange={(e) => updateField('shares', e.target.value)}
              placeholder="e.g. 10 or 2.5"
              className="input w-full font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
              Price per share
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={form.pricePerShare}
              onChange={(e) => updateField('pricePerShare', e.target.value)}
              placeholder="e.g. 450.00"
              className="input w-full font-mono"
            />
            {form.shares && form.pricePerShare && (
              <div className="text-[10px] text-text-muted mt-1">
                Total: {formatPrice(parseFloat(form.shares) * parseFloat(form.pricePerShare))}
              </div>
            )}
          </div>
        </div>
      )}

      {isDividend && (
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
            Dividend amount
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={form.totalAmount}
            onChange={(e) => updateField('totalAmount', e.target.value)}
            placeholder="Cash received"
            className="input w-full font-mono"
          />
        </div>
      )}

      {isSell && (
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
            Lot Method
          </label>
          <select
            value={form.lotMethod}
            onChange={(e) => updateField('lotMethod', e.target.value)}
            className="input w-full"
          >
            {LOT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <div className="text-[10px] text-text-muted mt-1">
            Controls which lots are consumed. Defaults to FIFO for stock/ETF, average cost for mutual fund.
          </div>
        </div>
      )}

      {/* Date + Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
            Occurred on
          </label>
          <input
            type="date"
            value={form.occurredAt}
            onChange={(e) => updateField('occurredAt', e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="input w-full font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
            Name <span className="text-text-muted normal-case">(optional)</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g. NVIDIA Corp"
            className="input w-full"
            maxLength={100}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
          Notes <span className="text-text-muted normal-case">(optional)</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Rationale, broker, tax lot id, etc."
          rows={2}
          maxLength={500}
          className="input w-full resize-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-crimson text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-ghost text-sm">
          Cancel
        </button>
        <button onClick={onSave} disabled={pending} className="btn-primary">
          {pending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {mode === 'edit' ? 'Save changes' : 'Record transaction'}
        </button>
      </div>
    </div>
  )
}
