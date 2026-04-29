/**
 * Simple SVG price chart used by both the Research dossier and the
 * inline bench expansion. Takes an array of {date, close} points; line
 * goes green if the period was up, crimson if down.
 */

export default function PriceChart({ data }) {
  if (!data || data.length < 2) return null

  const prices = data.map((d) => d.close)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const width = 700
  const height = 200
  const padding = 30
  const chartW = width - padding * 2
  const chartH = height - padding * 2

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartW
    const y = padding + chartH - ((d.close - min) / range) * chartH
    return `${x},${y}`
  }).join(' ')

  const isUp = prices[prices.length - 1] >= prices[0]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = padding + chartH - pct * chartH
        const price = min + pct * range
        return (
          <g key={pct}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--color-border, #2A2A33)" strokeWidth="1" />
            <text x={padding - 5} y={y + 3} textAnchor="end" fontSize="9" fill="var(--color-text-muted, #5A5E66)">${price.toFixed(0)}</text>
          </g>
        )
      })}
      <polyline points={points} fill="none" stroke={isUp ? '#5FA572' : '#B22234'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.filter((_, i) => i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)).map((d, idx) => {
        const i = idx === 0 ? 0 : idx === 1 ? Math.floor(data.length / 2) : data.length - 1
        const x = padding + (i / (data.length - 1)) * chartW
        return (
          <text key={d.date} x={x} y={height - 5} textAnchor="middle" fontSize="9" fill="var(--color-text-muted, #5A5E66)">
            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        )
      })}
    </svg>
  )
}
