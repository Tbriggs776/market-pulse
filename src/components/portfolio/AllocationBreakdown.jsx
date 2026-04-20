import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const ASSET_TYPE_LABEL = {
  stock: 'Stocks',
  etf: 'ETFs',
  mutual_fund: 'Mutual Funds',
}

const ASSET_TYPE_COLORS = {
  stock: '#C9A961',       // gold
  etf: '#1B3A6B',         // patriot
  mutual_fund: '#5FA572', // positive
}

// Muted institutional palette — ordering matters for readability when
// more sectors appear than distinct colors.
const SECTOR_COLORS = {
  'Technology': '#C9A961',
  'Financials': '#1B3A6B',
  'Health Care': '#5FA572',
  'Consumer Discretionary': '#E5C97A',
  'Consumer Staples': '#9B8349',
  'Industrials': '#2C5490',
  'Energy': '#8B6A3E',
  'Materials': '#6B6E76',
  'Utilities': '#3D7A4F',
  'Real Estate': '#9CA0A8',
  'Communication Services': '#5C3D7A',
  'ETF / Fund': '#B5935A',
  'Uncategorized': '#5A5E66',
  'Other': '#5A5E66',
}

const FALLBACK_COLOR = '#5A5E66'

function formatMoney(n) {
  if (n == null) return '--'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatPct(n) {
  if (n == null) return '--'
  return n.toFixed(1) + '%'
}

// Market value of a position: live quote if present, else cost basis.
function positionValue(p, quotes) {
  const q = quotes[p.symbol]
  const shares = Number(p.shares)
  if (q?.price != null) return shares * q.price
  return shares * Number(p.cost_basis_per_share)
}

function CustomTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null
  const { name, value, payload: entry } = payload[0]
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="bg-surface-elevated border border-border rounded px-3 py-2 text-xs">
      <div className="font-medium text-ivory">{name}</div>
      <div className="font-mono text-text-secondary">
        {formatMoney(value)} · {formatPct(pct)}
      </div>
      {entry?.count != null && (
        <div className="text-text-muted text-[10px] mt-0.5">
          {entry.count} {entry.count === 1 ? 'position' : 'positions'}
        </div>
      )}
    </div>
  )
}

function LegendRow({ color, label, value, pct, count }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-ivory truncate">{label}</span>
        {count != null && (
          <span className="text-text-muted text-[10px] shrink-0">({count})</span>
        )}
      </div>
      <div className="font-mono text-text-secondary text-[11px] shrink-0">
        {formatPct(pct)} · {formatMoney(value)}
      </div>
    </div>
  )
}

export default function AllocationBreakdown({ positions, quotes, metadata }) {
  // Asset-class slices (Stock / ETF / Mutual Fund)
  const assetClass = useMemo(() => {
    const buckets = {}
    for (const p of positions) {
      const v = positionValue(p, quotes)
      if (!buckets[p.asset_type]) {
        buckets[p.asset_type] = { value: 0, count: 0 }
      }
      buckets[p.asset_type].value += v
      buckets[p.asset_type].count += 1
    }
    const total = Object.values(buckets).reduce((a, b) => a + b.value, 0)
    const slices = Object.entries(buckets)
      .map(([type, b]) => ({
        name: ASSET_TYPE_LABEL[type] || type,
        value: b.value,
        count: b.count,
        color: ASSET_TYPE_COLORS[type] || FALLBACK_COLOR,
        pct: total > 0 ? (b.value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
    return { slices, total }
  }, [positions, quotes])

  // Sector slices -- requires metadata. "Uncategorized" covers any symbols
  // the metadata service hasn't resolved yet (still loading, or Polygon miss).
  const sector = useMemo(() => {
    const buckets = {}
    for (const p of positions) {
      const meta = metadata[p.symbol]
      const sectorName = meta?.sector || 'Uncategorized'
      const v = positionValue(p, quotes)
      if (!buckets[sectorName]) {
        buckets[sectorName] = { value: 0, count: 0 }
      }
      buckets[sectorName].value += v
      buckets[sectorName].count += 1
    }
    const total = Object.values(buckets).reduce((a, b) => a + b.value, 0)
    const slices = Object.entries(buckets)
      .map(([name, b]) => ({
        name,
        value: b.value,
        count: b.count,
        color: SECTOR_COLORS[name] || FALLBACK_COLOR,
        pct: total > 0 ? (b.value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
    return { slices, total }
  }, [positions, quotes, metadata])

  // Top-N concentration. Top 3 is the headline — it's the risk signal
  // investors most often overlook.
  const concentration = useMemo(() => {
    const items = positions
      .map((p) => ({
        symbol: p.symbol,
        value: positionValue(p, quotes),
      }))
      .sort((a, b) => b.value - a.value)
    const total = items.reduce((a, b) => a + b.value, 0)
    const topCount = Math.min(5, items.length)
    const top = items.slice(0, topCount).map((item) => ({
      ...item,
      pct: total > 0 ? (item.value / total) * 100 : 0,
    }))
    const restValue = items.slice(topCount).reduce((a, b) => a + b.value, 0)
    const restPct = total > 0 ? (restValue / total) * 100 : 0
    const top3Pct = top
      .slice(0, 3)
      .reduce((sum, item) => sum + item.pct, 0)
    return { top, restValue, restPct, total, top3Pct, totalCount: items.length }
  }, [positions, quotes])

  if (positions.length === 0) return null

  return (
    <div className="card space-y-6">
      <div>
        <h2 className="text-sm font-medium text-gold uppercase tracking-wide mb-1">
          Allocation
        </h2>
        <p className="text-xs text-text-secondary">
          How your {formatMoney(assetClass.total)} is distributed across asset class and sector.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Asset class */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-3">
            By Asset Class
          </div>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={assetClass.slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={36}
                    outerRadius={60}
                    paddingAngle={2}
                    stroke="#0A0A0B"
                    strokeWidth={2}
                  >
                    {assetClass.slices.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip total={assetClass.total} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0">
              {assetClass.slices.map((s) => (
                <LegendRow
                  key={s.name}
                  color={s.color}
                  label={s.name}
                  value={s.value}
                  pct={s.pct}
                  count={s.count}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sector */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-3">
            By Sector
          </div>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sector.slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={36}
                    outerRadius={60}
                    paddingAngle={2}
                    stroke="#0A0A0B"
                    strokeWidth={2}
                  >
                    {sector.slices.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip total={sector.total} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 max-h-32 overflow-y-auto">
              {sector.slices.map((s) => (
                <LegendRow
                  key={s.name}
                  color={s.color}
                  label={s.name}
                  value={s.value}
                  pct={s.pct}
                  count={s.count}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Concentration */}
      {concentration.totalCount >= 2 && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">
              Top Holdings Concentration
            </div>
            {concentration.totalCount >= 3 && (
              <div className="text-xs text-text-secondary">
                Top 3: <span className="font-mono text-ivory">{formatPct(concentration.top3Pct)}</span>
              </div>
            )}
          </div>

          {/* Stacked bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-surface-elevated mb-3">
            {concentration.top.map((item, i) => (
              <div
                key={item.symbol}
                style={{
                  width: `${item.pct}%`,
                  backgroundColor: i === 0 ? '#C9A961' :
                    i === 1 ? '#E5C97A' :
                    i === 2 ? '#9B8349' :
                    '#9CA0A8',
                }}
                title={`${item.symbol}: ${formatPct(item.pct)}`}
              />
            ))}
            {concentration.restPct > 0 && (
              <div
                style={{ width: `${concentration.restPct}%`, backgroundColor: '#2A2A33' }}
                title={`Other: ${formatPct(concentration.restPct)}`}
              />
            )}
          </div>

          {/* Labels */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {concentration.top.map((item) => (
              <div key={item.symbol} className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-mono text-ivory shrink-0">{item.symbol}</span>
                <span className="font-mono text-text-secondary">{formatPct(item.pct)}</span>
              </div>
            ))}
            {concentration.restPct > 0 && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-text-muted shrink-0">Other</span>
                <span className="font-mono text-text-muted">{formatPct(concentration.restPct)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
