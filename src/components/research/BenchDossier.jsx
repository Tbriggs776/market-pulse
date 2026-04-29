import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, AlertTriangle, Sparkles, TrendingUp, TrendingDown, Coins,
} from 'lucide-react'
import { researchService, stocksService, dividendsService } from '../../lib/api'
import PriceChart from './PriceChart'

function formatPrice(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatBigMoney(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return '$' + Math.round(n).toLocaleString('en-US')
}
function formatPercent(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function formatPctNoSign(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return n.toFixed(2) + '%'
}

function StatTile({ label, value, sub, accent }) {
  return (
    <div className="border border-border rounded-md p-3 bg-surface/40">
      <div className="text-[9px] uppercase tracking-wide text-text-muted mb-1">
        {label}
      </div>
      <div className={`font-mono text-sm ${accent || 'text-ivory'}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-text-muted mt-0.5 font-mono">{sub}</div>
      )}
    </div>
  )
}

export default function BenchDossier({ symbol, name, sector }) {
  // Slow call (~5-10s). 30-min staleTime matches the rest of the app's
  // research-brief usage so a Ticker Brief lookup populates this cache too.
  const briefQ = useQuery({
    queryKey: ['research-brief', symbol],
    queryFn: () => researchService.getTickerBrief(symbol),
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  })

  const quoteQ = useQuery({
    queryKey: ['quotes', symbol],
    queryFn: () => stocksService.getQuotes([symbol]),
    enabled: !!symbol,
    staleTime: 2 * 60 * 1000,
  })

  const divQ = useQuery({
    queryKey: ['dividend-history', symbol],
    queryFn: () => dividendsService.getDividendHistory([symbol]),
    enabled: !!symbol,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  })

  const brief = briefQ.data
  const quote = quoteQ.data?.[symbol] || brief?.quote || null
  const dividend = divQ.data?.[symbol] || null

  // 30-day high/low from the price history; reasonable stand-in for
  // 52-week range until we wire a longer aggs feed.
  const monthRange = useMemo(() => {
    const hist = brief?.history
    if (!Array.isArray(hist) || hist.length === 0) return null
    let lo = Infinity, hi = -Infinity
    for (const d of hist) {
      if (d.close < lo) lo = d.close
      if (d.close > hi) hi = d.close
    }
    return { lo, hi }
  }, [brief])

  const isUp = quote && quote.change != null && quote.change >= 0

  return (
    <div className="border-t border-border bg-surface/40">
      <div className="p-4 sm:p-5 space-y-4">
        {/* Header strip */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold text-gold">{symbol}</span>
              {brief?.company?.exchange && (
                <span className="text-[10px] uppercase tracking-wide text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded">
                  {brief.company.exchange}
                </span>
              )}
            </div>
            <div className="text-sm text-ivory">
              {brief?.company?.name || name || symbol}
            </div>
            {(brief?.company?.sector || sector) && (
              <div className="text-xs text-text-secondary mt-0.5">
                {brief?.company?.sector || sector}
              </div>
            )}
          </div>
          {quote && quote.price != null && (
            <div className="text-right">
              <div className="font-mono text-2xl text-ivory">
                {formatPrice(quote.price)}
              </div>
              {quote.changePercent != null && (
                <div className={`flex items-center justify-end gap-1 font-mono text-sm ${isUp ? 'text-positive' : 'text-crimson'}`}>
                  {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {formatPercent(quote.changePercent)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loading shimmer for the slow brief call */}
        {briefQ.isLoading && (
          <div className="flex items-center gap-2 text-xs text-text-muted py-2">
            <Loader2 className="w-3.5 h-3.5 text-gold animate-spin" />
            Loading dossier...
          </div>
        )}

        {briefQ.error && !briefQ.isLoading && (
          <div className="flex items-center gap-2 text-crimson text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Could not load dossier: {briefQ.error.message || 'unknown error'}
          </div>
        )}

        {/* Stat grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {quote && (
            <StatTile
              label="Day Range"
              value={`${formatPrice(quote.low)} – ${formatPrice(quote.high)}`}
            />
          )}
          {monthRange && (
            <StatTile
              label="30-Day Range"
              value={`${formatPrice(monthRange.lo)} – ${formatPrice(monthRange.hi)}`}
            />
          )}
          {brief?.company?.marketCap != null && (
            <StatTile
              label="Market Cap"
              value={formatBigMoney(brief.company.marketCap)}
            />
          )}
          {quote?.volume != null && (
            <StatTile
              label="Volume"
              value={Number(quote.volume).toLocaleString('en-US')}
            />
          )}
          {brief?.company?.totalEmployees != null && (
            <StatTile
              label="Employees"
              value={Number(brief.company.totalEmployees).toLocaleString('en-US')}
            />
          )}
          {brief?.company?.listDate && (
            <StatTile
              label="Listed"
              value={brief.company.listDate}
            />
          )}
          {dividend?.hasDividends && dividend.annualizedAmount > 0 && quote?.price != null && (
            <StatTile
              label="Div Yield"
              value={formatPctNoSign((dividend.annualizedAmount / quote.price) * 100)}
              sub={`${dividend.frequencyLabel} · ${formatPrice(dividend.latestAmount)}`}
              accent="text-gold"
            />
          )}
          {dividend?.hasDividends && dividend.growth5y != null && (
            <StatTile
              label="Div 5y Growth"
              value={`${(dividend.growth5y * 100).toFixed(1)}%`}
              accent={dividend.growth5y >= 0 ? 'text-positive' : 'text-crimson'}
            />
          )}
        </div>

        {/* Mini chart */}
        {Array.isArray(brief?.history) && brief.history.length > 1 && (
          <div className="border border-border rounded-md p-3 bg-surface/40">
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">
              30-Day Price
            </div>
            <PriceChart data={brief.history} />
          </div>
        )}

        {/* Dividend payment list when relevant -- newest 4 only, keeps the
            expansion compact while still surfacing the recent rhythm. */}
        {dividend?.hasDividends && Array.isArray(dividend.events) && dividend.events.length > 0 && (
          <div className="border border-border rounded-md p-3 bg-surface/40">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-3.5 h-3.5 text-gold" />
              <div className="text-[10px] uppercase tracking-wide text-text-muted">
                Recent Dividends
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {dividend.events.slice(0, 4).map((e, i) => (
                <div key={i} className="text-xs">
                  <div className="font-mono text-ivory">
                    {formatPrice(e.cashAmount)}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">
                    {e.exDate || '--'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Investment thesis */}
        {brief?.thesis && (
          <div className="border border-gold/20 rounded-md p-3 bg-gold/5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-gold" />
              <div className="text-[10px] uppercase tracking-wide text-gold font-semibold">
                Investment Thesis
              </div>
            </div>
            <div className="prose-briefing text-xs text-text-secondary leading-relaxed">
              {brief.thesis.split(/\n\s*\n/).map((p, i) => (
                <p key={i} className="mb-2 last:mb-0">{p}</p>
              ))}
            </div>
            <div className="text-[10px] text-text-muted mt-2 font-mono">
              {brief.model || 'AI'} · {brief.generatedAt ? new Date(brief.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            </div>
          </div>
        )}

        {/* About */}
        {brief?.company?.description && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
              About {brief.company.name || symbol}
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              {brief.company.description.length > 500
                ? brief.company.description.slice(0, 500) + '...'
                : brief.company.description}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
