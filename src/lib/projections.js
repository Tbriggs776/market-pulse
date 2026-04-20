/**
 * Portfolio return projections via analytical geometric Brownian motion.
 *
 * Pure function -- no data fetching, no randomness. Same math lives in
 * the advisor-chat edge function so get_portfolio can expose projections
 * without another round trip.
 *
 * Model:
 *   log-return over T years ~ Normal((mu - sigma^2/2) * T, sigma^2 * T)
 *   P_x = V0 * exp((mu - sigma^2/2)*T + z_x * sigma * sqrt(T))
 *
 * We use asset-class defaults because reliable per-ticker vol requires
 * multi-year price history we don't have. Portfolio mu/sigma are
 * value-weighted averages -- this approximates moderate correlation, which
 * is realistic for diversified holdings and a reasonable middle ground
 * for concentrated ones.
 */

export const ASSET_CLASS_ASSUMPTIONS = {
  stock:        { mu: 0.10, sigma: 0.18 },
  etf:          { mu: 0.09, sigma: 0.15 },
  mutual_fund:  { mu: 0.08, sigma: 0.12 },
}

// z-scores for the 10th and 90th percentiles of the standard normal.
const Z_P10 = -1.2815515655446004
const Z_P90 = 1.2815515655446004

const DEFAULT_HORIZONS = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30]
const TABLE_HORIZONS = [1, 5, 10, 20, 30]

// Asset-class defaults fall back to stock-like assumptions if the type
// isn't in the table (shouldn't happen today but keeps us crash-free).
function assumptionsFor(assetType) {
  return ASSET_CLASS_ASSUMPTIONS[assetType] || ASSET_CLASS_ASSUMPTIONS.stock
}

// Positions use live quote when available; fall back to cost basis so
// unpriced positions still contribute to the portfolio's starting value.
function positionValue(p, quotes) {
  const shares = Number(p.shares)
  const q = quotes?.[p.symbol]
  if (q?.price != null) return shares * Number(q.price)
  return shares * Number(p.cost_basis_per_share)
}

export function computeProjections({ positions, quotes, horizons = DEFAULT_HORIZONS }) {
  const enriched = positions.map((p) => {
    const value = positionValue(p, quotes)
    const { mu, sigma } = assumptionsFor(p.asset_type)
    return { value, mu, sigma, assetType: p.asset_type }
  })

  const currentValue = enriched.reduce((s, p) => s + p.value, 0)
  if (currentValue <= 0) {
    return {
      currentValue: 0,
      mu: 0,
      sigma: 0,
      points: [],
      tablePoints: [],
      perAssetClass: {},
    }
  }

  // Value-weighted portfolio mu and sigma.
  let weightedMu = 0
  let weightedSigma = 0
  const perAssetClass = {}
  for (const p of enriched) {
    const weight = p.value / currentValue
    weightedMu += weight * p.mu
    weightedSigma += weight * p.sigma
    if (!perAssetClass[p.assetType]) {
      perAssetClass[p.assetType] = { value: 0, mu: p.mu, sigma: p.sigma }
    }
    perAssetClass[p.assetType].value += p.value
  }

  const points = horizons.map((T) => project(currentValue, weightedMu, weightedSigma, T))
  const tablePoints = TABLE_HORIZONS.map((T) => project(currentValue, weightedMu, weightedSigma, T))

  return {
    currentValue,
    mu: weightedMu,
    sigma: weightedSigma,
    points,
    tablePoints,
    perAssetClass,
  }
}

function project(V0, mu, sigma, T) {
  if (T <= 0) return { years: 0, p10: V0, p50: V0, p90: V0 }
  const drift = (mu - (sigma * sigma) / 2) * T
  const diffusion = sigma * Math.sqrt(T)
  return {
    years: T,
    p10: V0 * Math.exp(drift + Z_P10 * diffusion),
    p50: V0 * Math.exp(drift),
    p90: V0 * Math.exp(drift + Z_P90 * diffusion),
  }
}
