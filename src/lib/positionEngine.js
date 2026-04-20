/**
 * Position engine: chronological replay of transactions into current positions
 * with lot-level tracking.
 *
 * Pure function -- no side effects, no Supabase. The same math is duplicated
 * inside the advisor-chat edge function (Deno/TS); keep the two in sync when
 * adding new transaction types or lot methods.
 *
 * Transaction types:
 *   - buy: appends a new lot
 *   - sell: consumes lots per lot_method (fifo or average_cost; more methods later)
 *   - dividend: tracked cumulatively, no share change
 *
 * Per-lot tracking lets us distinguish short-term (<= 365 days held) from
 * long-term (> 365 days) gains for tax purposes. Legacy sells without
 * lot_method default to average_cost so pre-Pass-13 realized P&L is stable.
 */

const CLOSED_EPSILON = 1e-8
const LONG_TERM_DAYS = 365

function syntheticId(symbol, assetType) {
  return `${symbol}:${assetType}`
}

function daysBetween(fromISO, toISO) {
  if (!fromISO) return 0
  const a = new Date(fromISO).getTime()
  const b = new Date(toISO).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

// Mutual funds use average cost; stocks/ETFs use FIFO. This matches both
// IRS norms (mutual funds must use average unless the user actively elects
// otherwise) and the defaults users see at major brokers.
function defaultLotMethod(assetType) {
  return assetType === 'mutual_fund' ? 'average_cost' : 'fifo'
}

// Legacy sells written before Pass 13 have lot_method == null. Treat those
// as average_cost so historical realized P&L doesn't shift under users.
function resolveLotMethod(txn, assetType) {
  if (!txn.lot_method) return 'average_cost'
  const m = String(txn.lot_method).toLowerCase()
  if (m === 'fifo' || m === 'average_cost') return m
  // Unknown method -- fall through to the asset-type default rather than fail.
  return defaultLotMethod(assetType)
}

// Consume `shares` from `openLots` using FIFO. Mutates openLots.
// Returns { realizedShort, realizedLong } for the consumed portion.
function consumeFifo(openLots, shares, sellPrice, sellDate) {
  let remaining = shares
  let realizedShort = 0
  let realizedLong = 0
  while (remaining > CLOSED_EPSILON && openLots.length > 0) {
    const lot = openLots[0]
    const take = Math.min(lot.shares, remaining)
    const gain = (sellPrice - lot.costBasis) * take
    const held = daysBetween(lot.buyDate, sellDate)
    if (held > LONG_TERM_DAYS) realizedLong += gain
    else realizedShort += gain
    lot.shares -= take
    remaining -= take
    if (lot.shares <= CLOSED_EPSILON) openLots.shift()
  }
  return { realizedShort, realizedLong }
}

// Average-cost sell: collapse all open lots to a single weighted-average
// basis, realize gain against that, and pro-rata reduce each lot so future
// sells still have date information for ST/LT classification.
function consumeAverageCost(openLots, shares, sellPrice, sellDate) {
  let totalShares = 0
  let totalCost = 0
  for (const lot of openLots) {
    totalShares += lot.shares
    totalCost += lot.shares * lot.costBasis
  }
  if (totalShares <= CLOSED_EPSILON) {
    return { realizedShort: 0, realizedLong: 0 }
  }
  const avgBasis = totalCost / totalShares
  const actualSold = Math.min(shares, totalShares)

  let realizedShort = 0
  let realizedLong = 0
  for (const lot of openLots) {
    const proportion = lot.shares / totalShares
    const lotSharesSold = actualSold * proportion
    const lotGain = (sellPrice - avgBasis) * lotSharesSold
    const held = daysBetween(lot.buyDate, sellDate)
    if (held > LONG_TERM_DAYS) realizedLong += lotGain
    else realizedShort += lotGain
    lot.shares -= lotSharesSold
  }
  // Filter exhausted lots in place.
  for (let i = openLots.length - 1; i >= 0; i--) {
    if (openLots[i].shares <= CLOSED_EPSILON) openLots.splice(i, 1)
  }
  return { realizedShort, realizedLong }
}

export function computePositions(transactions) {
  if (!transactions || transactions.length === 0) return []

  const groups = new Map()
  for (const t of transactions) {
    const key = syntheticId(t.symbol, t.asset_type)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }

  const today = new Date().toISOString().slice(0, 10)
  const positions = []

  for (const [key, txns] of groups) {
    txns.sort((a, b) => {
      const da = new Date(a.occurred_at).getTime()
      const db = new Date(b.occurred_at).getTime()
      if (da !== db) return da - db
      const ca = new Date(a.created_at || a.occurred_at).getTime()
      const cb = new Date(b.created_at || b.occurred_at).getTime()
      return ca - cb
    })

    const openLots = []
    let realizedShort = 0
    let realizedLong = 0
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
        openLots.push({
          buyDate: t.occurred_at,
          shares: buyShares,
          costBasis: buyPrice,
          txnId: t.id || null,
        })
        if (!firstBuyDate) firstBuyDate = t.occurred_at
      } else if (t.transaction_type === 'sell') {
        const sellShares = Number(t.shares) || 0
        const sellPrice = Number(t.price_per_share) || 0
        if (sellShares <= 0) continue
        const [symbol, assetType] = key.split(':')
        const method = resolveLotMethod(t, assetType)
        const { realizedShort: rs, realizedLong: rl } = method === 'fifo'
          ? consumeFifo(openLots, sellShares, sellPrice, t.occurred_at)
          : consumeAverageCost(openLots, sellShares, sellPrice, t.occurred_at)
        realizedShort += rs
        realizedLong += rl
      } else if (t.transaction_type === 'dividend') {
        totalDividends += Number(t.total_amount) || 0
      }
    }

    const totalShares = openLots.reduce((s, l) => s + l.shares, 0)
    if (totalShares <= CLOSED_EPSILON) continue

    const totalCost = openLots.reduce((s, l) => s + l.shares * l.costBasis, 0)
    const avgCost = totalShares > 0 ? totalCost / totalShares : 0

    // Enrich open lots with holding-period info as of today.
    let sharesShort = 0
    let sharesLong = 0
    let costBasisShort = 0
    let costBasisLong = 0
    const lotsDetail = openLots.map((lot) => {
      const daysHeld = daysBetween(lot.buyDate, today)
      const termType = daysHeld > LONG_TERM_DAYS ? 'long' : 'short'
      if (termType === 'long') {
        sharesLong += lot.shares
        costBasisLong += lot.shares * lot.costBasis
      } else {
        sharesShort += lot.shares
        costBasisShort += lot.shares * lot.costBasis
      }
      return {
        buy_date: lot.buyDate,
        shares: lot.shares,
        cost_basis_per_share: lot.costBasis,
        total_cost: lot.shares * lot.costBasis,
        days_held: daysHeld,
        term: termType,
        txn_id: lot.txnId,
      }
    })

    const [symbol, assetType] = key.split(':')
    positions.push({
      id: key,
      symbol,
      asset_type: assetType,
      name: name || '',
      shares: totalShares,
      cost_basis_per_share: avgCost,
      purchase_date: firstBuyDate,
      notes: latestNotes,
      realized_pnl: realizedShort + realizedLong,
      realized_pnl_short: realizedShort,
      realized_pnl_long: realizedLong,
      total_dividends: totalDividends,
      lots: lotsDetail,
      shares_short: sharesShort,
      shares_long: sharesLong,
      cost_basis_short: costBasisShort,
      cost_basis_long: costBasisLong,
      created_at: firstBuyDate,
      updated_at: latestTouch ? new Date(latestTouch).toISOString() : null,
    })
  }

  positions.sort((a, b) => {
    const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return ub - ua
  })

  return positions
}

export function parsePositionId(id) {
  if (!id || typeof id !== 'string') return null
  const idx = id.indexOf(':')
  if (idx <= 0) return null
  return { symbol: id.slice(0, idx), assetType: id.slice(idx + 1) }
}

export { syntheticId, defaultLotMethod, LONG_TERM_DAYS }
