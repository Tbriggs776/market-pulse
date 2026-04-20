/**
 * Position engine: chronological replay of transactions into current positions.
 *
 * Pure function -- no side effects, no Supabase. The same math is duplicated
 * inside the advisor-chat edge function (Deno/TS); keep the two in sync when
 * adding new transaction types.
 *
 * Current behavior (MVP):
 *   - buy: shares add, cost basis weight-averages
 *   - sell: shares subtract, avg cost basis unchanged, realized P&L accumulates
 *   - dividend: no share change, cumulative dividends tracked
 *
 * Positions are keyed by (symbol, asset_type). Closed positions (shares == 0)
 * are dropped from the returned list -- their history lives in transactions,
 * but they don't show up in the portfolio view.
 */

function syntheticId(symbol, assetType) {
  return `${symbol}:${assetType}`
}

// Tiny epsilon for float drift; treats sub-cent-share positions as closed.
const CLOSED_EPSILON = 1e-8

export function computePositions(transactions) {
  if (!transactions || transactions.length === 0) return []

  // Group by (symbol, asset_type)
  const groups = new Map()
  for (const t of transactions) {
    const key = syntheticId(t.symbol, t.asset_type)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }

  const positions = []

  for (const [key, txns] of groups) {
    // Chronological order. Ties broken by created_at so same-day buys
    // before same-day sells still produce stable numbers.
    txns.sort((a, b) => {
      const da = new Date(a.occurred_at).getTime()
      const db = new Date(b.occurred_at).getTime()
      if (da !== db) return da - db
      const ca = new Date(a.created_at || a.occurred_at).getTime()
      const cb = new Date(b.created_at || b.occurred_at).getTime()
      return ca - cb
    })

    let shares = 0
    let avgCost = 0
    let realizedPnl = 0
    let totalDividends = 0
    let firstBuyDate = null
    let latestTouch = null
    let name = null
    let latestNotes = null

    for (const t of txns) {
      if (!name && t.name) name = t.name
      if (t.notes) latestNotes = t.notes
      const ts = new Date(t.created_at || t.occurred_at).getTime()
      if (latestTouch == null || ts > latestTouch) latestTouch = ts

      if (t.transaction_type === 'buy') {
        const buyShares = Number(t.shares) || 0
        const buyPrice = Number(t.price_per_share) || 0
        if (buyShares <= 0) continue
        const newShares = shares + buyShares
        // Weighted average cost basis, clamped at zero when re-opening a
        // closed position (prior avgCost stops applying once shares hit 0).
        const baseCost = shares > CLOSED_EPSILON ? shares * avgCost : 0
        avgCost = newShares > 0
          ? (baseCost + buyShares * buyPrice) / newShares
          : 0
        shares = newShares
        if (!firstBuyDate) firstBuyDate = t.occurred_at
      } else if (t.transaction_type === 'sell') {
        const sellShares = Number(t.shares) || 0
        const sellPrice = Number(t.price_per_share) || 0
        if (sellShares <= 0) continue
        const actualSold = Math.min(sellShares, shares)
        realizedPnl += (sellPrice - avgCost) * actualSold
        shares -= actualSold
        // avgCost unchanged on sells (average cost method).
        if (shares <= CLOSED_EPSILON) {
          shares = 0
          avgCost = 0
        }
      } else if (t.transaction_type === 'dividend') {
        totalDividends += Number(t.total_amount) || 0
      }
    }

    if (shares > CLOSED_EPSILON) {
      const [symbol, assetType] = key.split(':')
      positions.push({
        id: key,
        symbol,
        asset_type: assetType,
        name: name || '',
        shares,
        cost_basis_per_share: avgCost,
        purchase_date: firstBuyDate,
        notes: latestNotes,
        realized_pnl: realizedPnl,
        total_dividends: totalDividends,
        created_at: firstBuyDate,
        updated_at: latestTouch ? new Date(latestTouch).toISOString() : null,
      })
    }
  }

  // Most-recently-touched first -- matches the old `order by created_at desc`
  // behavior users expect on the Portfolio page.
  positions.sort((a, b) => {
    const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return ub - ua
  })

  return positions
}

// Parse a synthetic position id back into (symbol, assetType).
// Used by portfolioApi.remove to turn a computed position id into a DELETE filter.
export function parsePositionId(id) {
  if (!id || typeof id !== 'string') return null
  const idx = id.indexOf(':')
  if (idx <= 0) return null
  return {
    symbol: id.slice(0, idx),
    assetType: id.slice(idx + 1),
  }
}

export { syntheticId }
