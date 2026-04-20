/**
 * What-if simulation: apply proposed changes to a copy of the portfolio,
 * then diff the current vs. hypothetical allocation.
 *
 * All functions are pure -- no side effects on the passed-in positions.
 * Value math mirrors AllocationBreakdown: live quote when present, else cost basis.
 */

// Apply a list of proposed changes to a copy of positions.
// Returns { hypotheticalPositions, issues } where issues is user-facing warnings.
export function applyChanges(positions, changes) {
  const result = positions.map((p) => ({ ...p }))
  const issues = []

  for (const c of changes) {
    const symbol = (c.symbol || '').toUpperCase()
    const assetType = c.assetType || c.asset_type || 'stock'
    const shares = Number(c.shares) || 0
    if (!symbol || shares <= 0) continue

    const idx = result.findIndex(
      (p) => p.symbol === symbol && p.asset_type === assetType
    )

    if (c.action === 'buy') {
      // Cost basis unknown in sim -- use current market price if we have a quote,
      // else 0. For allocation percentages only shares + value matter.
      if (idx >= 0) {
        result[idx] = { ...result[idx], shares: Number(result[idx].shares) + shares }
      } else {
        result.push({
          id: `sim-${symbol}-${Date.now()}`,
          symbol,
          name: c.name || '',
          asset_type: assetType,
          shares,
          cost_basis_per_share: c.costBasisPerShare ?? 0,
          _simulated: true,
        })
      }
    } else if (c.action === 'add') {
      if (idx < 0) {
        issues.push(`Add to ${symbol}: no existing position -- treating as new buy`)
        result.push({
          id: `sim-${symbol}-${Date.now()}`,
          symbol,
          name: c.name || '',
          asset_type: assetType,
          shares,
          cost_basis_per_share: c.costBasisPerShare ?? 0,
          _simulated: true,
        })
      } else {
        result[idx] = { ...result[idx], shares: Number(result[idx].shares) + shares }
      }
    } else if (c.action === 'trim') {
      if (idx < 0) {
        issues.push(`Trim ${symbol}: no existing position`)
        continue
      }
      const current = Number(result[idx].shares)
      if (shares >= current) {
        issues.push(`Trim ${shares} ${symbol} exceeds held ${current} -- simulating full exit`)
        result.splice(idx, 1)
      } else {
        result[idx] = { ...result[idx], shares: current - shares }
      }
    } else if (c.action === 'sell') {
      if (idx < 0) {
        issues.push(`Sell ${symbol}: no existing position`)
        continue
      }
      result.splice(idx, 1)
    }
  }
  return { hypotheticalPositions: result, issues }
}

// Compute allocation totals: value by asset class, top holdings, top-3 concentration.
export function computeAllocation(positions, quotes) {
  const byAssetClass = {}
  let totalValue = 0
  const perHolding = []
  for (const p of positions) {
    const q = quotes[p.symbol]
    const shares = Number(p.shares)
    const basis = Number(p.cost_basis_per_share)
    const value = q?.price != null ? shares * q.price : shares * basis
    totalValue += value
    byAssetClass[p.asset_type] = (byAssetClass[p.asset_type] || 0) + value
    perHolding.push({ symbol: p.symbol, value })
  }
  const assetClassPct = {}
  for (const [k, v] of Object.entries(byAssetClass)) {
    assetClassPct[k] = totalValue > 0 ? (v / totalValue) * 100 : 0
  }
  perHolding.sort((a, b) => b.value - a.value)
  const top3Value = perHolding.slice(0, 3).reduce((s, h) => s + h.value, 0)
  const top3Pct = totalValue > 0 ? (top3Value / totalValue) * 100 : 0
  return {
    totalValue,
    assetClassPct,
    top3Pct,
    positionCount: positions.length,
    topHoldings: perHolding.slice(0, 5).map((h) => ({
      ...h,
      pct: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
    })),
  }
}

// True if every change in the proposal is apply-safe (trim/sell only).
// Buy/add require a cost basis the advisor doesn't have; those need the
// Add Position form so the user can confirm the price.
export function canDirectApply(changes) {
  if (!changes || changes.length === 0) return false
  return changes.every((c) => c.action === 'trim' || c.action === 'sell')
}
