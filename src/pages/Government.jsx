import { useQuery } from '@tanstack/react-query'
import {
  Landmark, TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  Sparkles, DollarSign, Scale, CreditCard, BarChart3
} from 'lucide-react'
import { treasuryService } from '../lib/api'

export default function Government() {
  const {
    data: fiscal,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['treasury-data'],
    queryFn: treasuryService.getFiscalOverview,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  function trillions(n) {
    if (n == null) return '--'
    return '$' + (n / 1e12).toFixed(2) + 'T'
  }

  function billions(n) {
    if (n == null) return '--'
    return '$' + (n / 1e9).toFixed(0) + 'B'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Government & Fiscal
          </h1>
          <p className="text-sm text-text-secondary">
            Treasury data, fiscal balance, and economic outlook
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary self-start"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-3 bg-surface-elevated rounded w-24 mb-3" />
                <div className="h-8 bg-surface-elevated rounded w-32" />
              </div>
            ))}
          </div>
          <div className="card-elevated animate-pulse">
            <div className="space-y-3">
              <div className="h-4 bg-surface-elevated rounded w-3/4" />
              <div className="h-4 bg-surface-elevated rounded w-full" />
              <div className="h-4 bg-surface-elevated rounded w-5/6" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="card border-crimson/30">
          <div className="flex items-center gap-2 text-crimson text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error.message || 'Failed to load fiscal data'}
          </div>
        </div>
      )}

      {/* Content */}
      {fiscal && !isLoading && (
        <div className="space-y-8">

          {/* Debt Snapshot */}
          {fiscal.debt && fiscal.debt.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
                <DollarSign className="w-5 h-5 text-gold" />
                National Debt
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card-elevated">
                  <div className="text-xs text-text-muted mb-1">Total Public Debt</div>
                  <div className="font-mono text-2xl text-ivory">
                    {trillions(fiscal.debt[0].totalDebt)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    as of {fiscal.debt[0].date}
                  </div>
                </div>
                <div className="card-elevated">
                  <div className="text-xs text-text-muted mb-1">Debt Held by Public</div>
                  <div className="font-mono text-2xl text-ivory">
                    {trillions(fiscal.debt[0].publicDebt)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {((fiscal.debt[0].publicDebt / fiscal.debt[0].totalDebt) * 100).toFixed(1)}% of total
                  </div>
                </div>
                <div className="card-elevated">
                  <div className="text-xs text-text-muted mb-1">Intragovernmental</div>
                  <div className="font-mono text-2xl text-ivory">
                    {trillions(fiscal.debt[0].intragovDebt)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {((fiscal.debt[0].intragovDebt / fiscal.debt[0].totalDebt) * 100).toFixed(1)}% of total
                  </div>
                </div>
              </div>

              {/* Debt trend chart */}
              {fiscal.debt.length > 5 && (
                <div className="card mt-4">
                  <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-4">
                    30-Day Debt Trend
                  </h3>
                  <DebtChart data={fiscal.debt} />
                </div>
              )}
            </section>
          )}

          {/* Fiscal Balance */}
          {fiscal.fiscal && fiscal.fiscal.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
                <Scale className="w-5 h-5 text-gold" />
                Monthly Fiscal Balance
              </h2>
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-5 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
                  <div>Period</div>
                  <div className="text-right">Receipts</div>
                  <div className="text-right">Outlays</div>
                  <div className="text-right">Deficit/Surplus</div>
                  <div className="text-right">Balance</div>
                </div>
                {fiscal.fiscal.slice(0, 12).map((f, i) => {
                  const isDeficit = f.deficit < 0
                  return (
                    <div key={i} className="card grid grid-cols-5 gap-4 items-center">
                      <div className="text-sm text-ivory">
                        FY{f.fiscalYear} - M{f.month}
                      </div>
                      <div className="text-right font-mono text-sm text-positive">
                        {billions(f.receipts)}
                      </div>
                      <div className="text-right font-mono text-sm text-crimson">
                        {billions(f.outlays)}
                      </div>
                      <div className={`text-right font-mono text-sm ${isDeficit ? 'text-crimson' : 'text-positive'}`}>
                        {billions(Math.abs(f.deficit))}
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-0.5 rounded ${isDeficit ? 'bg-crimson/10 text-crimson' : 'bg-positive/10 text-positive'}`}>
                          {isDeficit ? 'Deficit' : 'Surplus'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Interest Expense */}
          {fiscal.interest && fiscal.interest.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
                <CreditCard className="w-5 h-5 text-gold" />
                Interest Expense
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card-elevated">
                  <div className="text-xs text-text-muted mb-1">Latest Monthly Interest</div>
                  <div className="font-mono text-2xl text-crimson">
                    {billions(fiscal.interest[0].monthTotal)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {fiscal.interest[0].date}
                  </div>
                </div>
                <div className="card-elevated">
                  <div className="text-xs text-text-muted mb-1">Fiscal Year-to-Date Interest</div>
                  <div className="font-mono text-2xl text-crimson">
                    {billions(fiscal.interest[0].fytdTotal)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    FY{fiscal.interest[0].fiscalYear}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* AI Fiscal Outlook */}
          {fiscal.outlook && (
            <section>
              <div className="card-elevated border-gold/20">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <span className="text-xs font-medium text-gold uppercase tracking-wide">
                    Fiscal & Economic Outlook
                  </span>
                </div>
                <div className="prose-briefing text-sm">
                  {fiscal.outlook.split(/\n\s*\n/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
                  <span>
                    Generated{' '}
                    {fiscal.generatedAt
                      ? new Date(fiscal.generatedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                  <span className="font-mono">{fiscal.model}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Debt Trend SVG Chart ----

function DebtChart({ data }) {
  if (!data || data.length < 2) return null

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const values = sorted.map((d) => d.totalDebt)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const width = 700
  const height = 180
  const padding = 40
  const chartW = width - padding * 2
  const chartH = height - padding * 2

  const points = sorted.map((d, i) => {
    const x = padding + (i / (sorted.length - 1)) * chartW
    const y = padding + chartH - ((d.totalDebt - min) / range) * chartH
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.5, 1].map((pct) => {
        const y = padding + chartH - pct * chartH
        const val = min + pct * range
        return (
          <g key={pct}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--color-border, #2A2A33)" strokeWidth="1" />
            <text x={padding - 5} y={y + 3} textAnchor="end" fontSize="8" fill="var(--color-text-muted, #5A5E66)">
              ${(val / 1e12).toFixed(1)}T
            </text>
          </g>
        )
      })}
      <polyline points={points} fill="none" stroke="#B22234" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {sorted.filter((_, i) => i === 0 || i === sorted.length - 1).map((d, idx) => {
        const i = idx === 0 ? 0 : sorted.length - 1
        const x = padding + (i / (sorted.length - 1)) * chartW
        return (
          <text key={d.date} x={x} y={height - 5} textAnchor="middle" fontSize="8" fill="var(--color-text-muted, #5A5E66)">
            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        )
      })}
    </svg>
  )
}