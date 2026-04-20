/**
 * Portfolio math helpers shared between authenticated API and anonymous store
 * so both code paths produce identical position merges.
 */

// Merge a new lot into an existing position: weighted-average the cost basis,
// sum the shares, and null out purchase_date since the position no longer
// represents a single purchase event.
export function mergeLot(existing, added) {
  const existingShares = Number(existing.shares)
  const existingBasis = Number(existing.cost_basis_per_share)
  const addedShares = Number(added.shares)
  const addedBasis = Number(added.costBasisPerShare)
  const totalShares = existingShares + addedShares
  const avgBasis =
    (existingShares * existingBasis + addedShares * addedBasis) / totalShares
  return {
    shares: totalShares,
    cost_basis_per_share: avgBasis,
    purchase_date: null,
  }
}
