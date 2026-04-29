import { useMemo } from 'react'
import { Coins, AlertCircle } from 'lucide-react'

const FREQUENCY_BADGE = {
  Monthly: 'bg-positive/10 text-positive',
  Quarterly: 'bg-gold/10 text-gold',
  'Semi-Annual': 'bg-gold/10 text-gold',
  Annual: 'bg-text-muted/20 text-text-secondary',
  Irregular: 'bg-text-muted/20 text-text-muted',
}

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMoneyRound(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return n.toFixed(2) + '%'
}

function daysAgoLabel(iso) {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'upcoming'
  if (days === 0) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// "Stale" if the last payment is older than ~1.5x the expected interval.
// Catches positions where the company stopped or skipped a payment.
function isStale(summary) {
  if (!summary?.latestExDate) return false
  const days = Math.floor((Date.now() - new Date(summary.latestExDate).getTime()) / (1000 * 60 * 60 * 24))
  const f = summary.frequency
  if (f === 12) return days > 60
  if (f === 4) return days > 135
  if (f === 2) return days > 270
  if (f === 1) return days > 540
  return false
}

export default function IncomePanel({ positions, quotes, dividends }) {
  const rows = useMemo(() => {
    const out = []
    for (const p of positions) {
      const div = dividends?.[p.symbol]
      if (!div || !div.hasDividends || div.annualizedAmount <= 0) continue
      const shares = Number(p.shares)
      const basis = Number(p.cost_basis_per_share)
      const q = quotes?.[p.symbol]
      const price = q?.price ?? null
      const marketValue = price != null ? shares * price : shares * basis
      const totalCost = shares * basis
      const forwardAnnual = shares * div.annualizedAmount
      const yieldOnValue = marketValue > 0 ? (forwardAnnual / marketValue) * 100 : null
      const yieldOnCost = totalCost > 0 ? (forwardAnnual / totalCost) * 100 : null
      out.push({
        symbol: p.symbol,
        name: p.name,
        shares,
        forwardAnnual,
        yieldOnValue,
        yieldOnCost,
        latestAmount: div.latestAmount,
        latestExDate: div.latestExDate,
        frequency: div.frequency,
        frequencyLabel: div.frequencyLabel,
        growth5y: div.growth5y,
        marketValue,
        stale: isStale(div),
      })
    }
    out.sort((a, b) => b.forwardAnnual - a.forwardAnnual)
    return out
  }, [positions, quotes, dividends])

  const totals = useMemo(() => {
    let portfolioValue = 0
    for (const p of positions) {
      const q = quotes?.[p.symbol]
      const shares = Number(p.shares)
      const price = q?.price ?? Number(p.cost_basis_per_share)
      portfolioValue += shares * price
    }
    const annualIncome = rows.reduce((s, r) => s + r.forwardAnnual, 0)
    const blendedYield = portfolioValue > 0 ? (annualIncome / portfolioValue) * 100 : null
    const dividendPayingValue = rows.reduce((s, r) => s + r.marketValue, 0)
    return { portfolioValue, annualIncome, blendedYield, dividendPayingValue }
  }, [positions, quotes, rows])

  if (rows.length === 0) return null

  return (
    <div className="card space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded bg-gold/10">
          <Coins className="w-4 h-4 text-gold" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-medium text-gold uppercase tracking-wide mb-1">
            Income
          </h2>
          <p className="text-xs text-text-secondary">
            Forward annual based on the latest dividend annualized at its frequency.
            A recent special or one-off can skew this -- treat as a current-rate snapshot, not a guarantee.
          </p>
        </div>
      </div>

      {/* Aggregate */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-border rounded-md p-3 bg-surface/40">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
            Forward annual income
          </div>
          <div className="font-mono text-2xl text-ivory">
            {formatMoneyRound(totals.annualIncome)}
          </div>
        </div>
        <div className="border border-border rounded-md p-3 bg-surface/40">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
            Blended yield (on portfolio)
          </div>
          <div className="font-mono text-2xl text-ivory">
            {formatPct(totals.blendedYield)}
          </div>
        </div>
        <div className="border border-border rounded-md p-3 bg-surface/40">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
            Dividend-paying positions
          </div>
          <div className="font-mono text-2xl text-ivory">
            {rows.length}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">
            {totals.portfolioValue > 0
              ? `${((totals.dividendPayingValue / totals.portfolioValue) * 100).toFixed(0)}% of portfolio value`
              : ''}
          </div>
        </div>
      </div>

      {/* Per-position table */}
      <div>
        <div className="hidden sm:grid grid-cols-12 gap-4 px-3 py-2 text-[10px] text-text-muted uppercase tracking-wide border-b border-border">
          <div className="col-span-3">Symbol</div>
          <div className="col-span-2">Latest</div>
          <div className="col-span-2 text-right">Forward annual</div>
          <div className="col-span-2 text-right">Yield (value)</div>
          <div className="col-span-2 text-right">Yield (cost)</div>
          <div className="col-span-1 text-right">5y growth</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.symbol}
            className="grid grid-cols-2 sm:grid-cols-12 gap-3 sm:gap-4 px-3 py-3 items-center border-b border-border/40 last:border-b-0 text-xs"
          >
            <div className="col-span-2 sm:col-span-3 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold text-ivory">{r.symbol}</span>
                <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${FREQUENCY_BADGE[r.frequencyLabel] || 'bg-text-muted/20 text-text-secondary'}`}>
                  {r.frequencyLabel}
                </span>
                {r.stale && (
                  <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-crimson bg-crimson/10 border border-crimson/20 px-1.5 py-0.5 rounded" title="Last payment is older than expected -- the company may have skipped or stopped">
                    <AlertCircle className="w-2.5 h-2.5" />
                    Stale
                  </span>
                )}
              </div>
              {r.name && (
                <div className="text-[10px] text-text-secondary truncate">{r.name}</div>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="text-[10px] sm:hidden uppercase tracking-wide text-text-muted">Latest</div>
              <div className="font-mono text-ivory">{formatMoney(r.latestAmount)}</div>
              <div className="text-[10px] text-text-muted">
                {daysAgoLabel(r.latestExDate)}
              </div>
            </div>

            <div className="sm:col-span-2 text-right">
              <div className="text-[10px] sm:hidden uppercase tracking-wide text-text-muted">Forward annual</div>
              <div className="font-mono text-ivory">{formatMoneyRound(r.forwardAnnual)}</div>
            </div>

            <div className="sm:col-span-2 text-right">
              <div className="text-[10px] sm:hidden uppercase tracking-wide text-text-muted">Yield (value)</div>
              <div className="font-mono text-ivory">{formatPct(r.yieldOnValue)}</div>
            </div>

            <div className="sm:col-span-2 text-right">
              <div className="text-[10px] sm:hidden uppercase tracking-wide text-text-muted">Yield (cost)</div>
              <div className="font-mono text-positive">{formatPct(r.yieldOnCost)}</div>
            </div>

            <div className="col-span-2 sm:col-span-1 text-right">
              <div className="text-[10px] sm:hidden uppercase tracking-wide text-text-muted">5y growth</div>
              {r.growth5y != null ? (
                <span className={`font-mono ${r.growth5y >= 0 ? 'text-positive' : 'text-crimson'}`}>
                  {(r.growth5y * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="text-text-muted">--</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
