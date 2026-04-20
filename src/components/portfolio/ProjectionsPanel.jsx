import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
} from 'recharts'
import { Info } from 'lucide-react'
import { computeProjections } from '../../lib/projections'

const ASSET_LABEL = {
  stock: 'Stocks',
  etf: 'ETFs',
  mutual_fund: 'Mutual Funds',
}

function formatMoney(n) {
  if (n == null) return '--'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1000)}K`
  return `$${Math.round(n)}`
}

function formatMoneyFull(n) {
  if (n == null) return '--'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function formatPct(n) {
  if (n == null) return '--'
  return (n * 100).toFixed(1) + '%'
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  return (
    <div className="bg-surface-elevated border border-border rounded px-3 py-2 text-xs space-y-0.5">
      <div className="font-medium text-ivory">Year {p.years}</div>
      <div className="font-mono text-text-secondary">
        <span className="text-positive">Bull</span> {formatMoneyFull(p.p90)}
      </div>
      <div className="font-mono text-ivory">
        Median {formatMoneyFull(p.p50)}
      </div>
      <div className="font-mono text-text-secondary">
        <span className="text-crimson">Bear</span> {formatMoneyFull(p.p10)}
      </div>
    </div>
  )
}

export default function ProjectionsPanel({ positions, quotes }) {
  const proj = useMemo(
    () => computeProjections({ positions, quotes }),
    [positions, quotes]
  )

  if (proj.currentValue <= 0) return null

  // Recharts Area accepts array-valued data for bands: [low, high] per point.
  // We precompute that plus the median as a separate line.
  const chartData = [
    { years: 0, range: [proj.currentValue, proj.currentValue], p50: proj.currentValue, p10: proj.currentValue, p90: proj.currentValue },
    ...proj.points.map((pt) => ({
      years: pt.years,
      range: [pt.p10, pt.p90],
      p10: pt.p10,
      p50: pt.p50,
      p90: pt.p90,
    })),
  ]

  const classWeights = Object.entries(proj.perAssetClass)
    .map(([k, v]) => ({
      key: k,
      label: ASSET_LABEL[k] || k,
      weight: v.value / proj.currentValue,
      mu: v.mu,
      sigma: v.sigma,
    }))
    .sort((a, b) => b.weight - a.weight)

  return (
    <div className="card space-y-5">
      <div>
        <h2 className="text-sm font-medium text-gold uppercase tracking-wide mb-1">
          Projections
        </h2>
        <p className="text-xs text-text-secondary">
          Illustrative range at historical asset-class averages &mdash; not a forecast.
          Does not model contributions, taxes, or inter-asset correlation.
        </p>
      </div>

      {/* Chart */}
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <XAxis
              dataKey="years"
              type="number"
              domain={[0, 30]}
              ticks={[0, 5, 10, 15, 20, 25, 30]}
              stroke="#5A5E66"
              tick={{ fill: '#9CA0A8', fontSize: 10 }}
              tickFormatter={(v) => `${v}y`}
            />
            <YAxis
              stroke="#5A5E66"
              tick={{ fill: '#9CA0A8', fontSize: 10 }}
              tickFormatter={formatMoney}
              width={52}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="range"
              stroke="none"
              fill="#C9A961"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#C9A961"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div>
        <div className="grid grid-cols-12 gap-2 text-[10px] text-text-muted uppercase tracking-wide pb-2 border-b border-border">
          <div className="col-span-3">Horizon</div>
          <div className="col-span-3 text-right text-crimson">Bear (10%)</div>
          <div className="col-span-3 text-right text-ivory">Median (50%)</div>
          <div className="col-span-3 text-right text-positive">Bull (90%)</div>
        </div>
        {proj.tablePoints.map((pt) => (
          <div
            key={pt.years}
            className="grid grid-cols-12 gap-2 py-2 border-b border-border/40 last:border-b-0 items-center text-xs"
          >
            <div className="col-span-3 text-text-secondary">
              {pt.years} {pt.years === 1 ? 'year' : 'years'}
            </div>
            <div className="col-span-3 text-right font-mono text-crimson">
              {formatMoneyFull(pt.p10)}
            </div>
            <div className="col-span-3 text-right font-mono text-ivory">
              {formatMoneyFull(pt.p50)}
            </div>
            <div className="col-span-3 text-right font-mono text-positive">
              {formatMoneyFull(pt.p90)}
            </div>
          </div>
        ))}
      </div>

      {/* Assumptions footer */}
      <div className="pt-3 border-t border-border">
        <div className="flex items-start gap-2 text-[11px] text-text-muted">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div>
              Portfolio-weighted <span className="font-mono text-text-secondary">&mu; = {formatPct(proj.mu)}</span>{' '}
              <span className="font-mono text-text-secondary">&sigma; = {formatPct(proj.sigma)}</span>
            </div>
            <div>
              {classWeights.map((c, i) => (
                <span key={c.key}>
                  {i > 0 ? ' · ' : ''}
                  {c.label}{' '}
                  <span className="font-mono text-text-secondary">
                    {(c.weight * 100).toFixed(0)}% @ {formatPct(c.mu)}/{formatPct(c.sigma)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
