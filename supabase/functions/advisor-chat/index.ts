import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const MODEL_IDS: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
  haiku: "claude-haiku-4-5",
}

const MAX_TOOL_CALLS = 5
const MAX_LOOPS = 6

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Position engine: mirrors src/lib/positionEngine.js. Keep in sync when
// adding new transaction types or lot methods.
const CLOSED_EPSILON = 1e-8
const LONG_TERM_DAYS = 365

interface Txn {
  symbol: string
  name?: string | null
  asset_type: string
  transaction_type: string
  shares?: number | string | null
  price_per_share?: number | string | null
  total_amount?: number | string | null
  occurred_at: string
  notes?: string | null
  lot_method?: string | null
  created_at?: string | null
  id?: string | null
}

interface OpenLot {
  buyDate: string
  shares: number
  costBasis: number
  txnId: string | null
}

interface LotDetail {
  buy_date: string
  shares: number
  cost_basis_per_share: number
  total_cost: number
  days_held: number
  term: 'short' | 'long'
  txn_id: string | null
}

interface DerivedPosition {
  id: string
  symbol: string
  asset_type: string
  name: string
  shares: number
  cost_basis_per_share: number
  purchase_date: string | null
  notes: string | null
  realized_pnl: number
  realized_pnl_short: number
  realized_pnl_long: number
  total_dividends: number
  lots: LotDetail[]
  shares_short: number
  shares_long: number
  cost_basis_short: number
  cost_basis_long: number
  created_at: string | null
  updated_at: string | null
}

function daysBetween(fromISO: string, toISO: string): number {
  if (!fromISO) return 0
  const a = new Date(fromISO).getTime()
  const b = new Date(toISO).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function defaultLotMethod(assetType: string): string {
  return assetType === 'mutual_fund' ? 'average_cost' : 'fifo'
}

function resolveLotMethod(txn: Txn, assetType: string): string {
  if (!txn.lot_method) return 'average_cost' // legacy sells
  const m = String(txn.lot_method).toLowerCase()
  if (m === 'fifo' || m === 'lifo' || m === 'hifo' || m === 'average_cost') return m
  return defaultLotMethod(assetType)
}

function consumeFifo(openLots: OpenLot[], shares: number, sellPrice: number, sellDate: string) {
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

function consumeLifo(openLots: OpenLot[], shares: number, sellPrice: number, sellDate: string) {
  let remaining = shares
  let realizedShort = 0
  let realizedLong = 0
  while (remaining > CLOSED_EPSILON && openLots.length > 0) {
    const lot = openLots[openLots.length - 1]
    const take = Math.min(lot.shares, remaining)
    const gain = (sellPrice - lot.costBasis) * take
    const held = daysBetween(lot.buyDate, sellDate)
    if (held > LONG_TERM_DAYS) realizedLong += gain
    else realizedShort += gain
    lot.shares -= take
    remaining -= take
    if (lot.shares <= CLOSED_EPSILON) openLots.pop()
  }
  return { realizedShort, realizedLong }
}

function consumeHifo(openLots: OpenLot[], shares: number, sellPrice: number, sellDate: string) {
  let remaining = shares
  let realizedShort = 0
  let realizedLong = 0
  const sorted = [...openLots].sort((a, b) => b.costBasis - a.costBasis)
  for (const lot of sorted) {
    if (remaining <= CLOSED_EPSILON) break
    if (lot.shares <= CLOSED_EPSILON) continue
    const take = Math.min(lot.shares, remaining)
    const gain = (sellPrice - lot.costBasis) * take
    const held = daysBetween(lot.buyDate, sellDate)
    if (held > LONG_TERM_DAYS) realizedLong += gain
    else realizedShort += gain
    lot.shares -= take
    remaining -= take
  }
  for (let i = openLots.length - 1; i >= 0; i--) {
    if (openLots[i].shares <= CLOSED_EPSILON) openLots.splice(i, 1)
  }
  return { realizedShort, realizedLong }
}

function consumeAverageCost(openLots: OpenLot[], shares: number, sellPrice: number, sellDate: string) {
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
  for (let i = openLots.length - 1; i >= 0; i--) {
    if (openLots[i].shares <= CLOSED_EPSILON) openLots.splice(i, 1)
  }
  return { realizedShort, realizedLong }
}

function computePositionsFromTransactions(transactions: Txn[]): DerivedPosition[] {
  if (!transactions || transactions.length === 0) return []
  const groups = new Map<string, Txn[]>()
  for (const t of transactions) {
    const key = `${t.symbol}:${t.asset_type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const today = new Date().toISOString().slice(0, 10)
  const positions: DerivedPosition[] = []

  for (const [key, txns] of groups) {
    txns.sort((a, b) => {
      const da = new Date(a.occurred_at).getTime()
      const db = new Date(b.occurred_at).getTime()
      if (da !== db) return da - db
      const ca = new Date(a.created_at || a.occurred_at).getTime()
      const cb = new Date(b.created_at || b.occurred_at).getTime()
      return ca - cb
    })

    const openLots: OpenLot[] = []
    let realizedShort = 0
    let realizedLong = 0
    let totalDividends = 0
    let firstBuyDate: string | null = null
    let latestTouch: number | null = null
    let name: string | null = null
    let latestNotes: string | null = null

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
        const [_, assetType] = key.split(':')
        const method = resolveLotMethod(t, assetType)
        let rs = 0, rl = 0
        if (method === 'fifo') {
          ;({ realizedShort: rs, realizedLong: rl } = consumeFifo(openLots, sellShares, sellPrice, t.occurred_at))
        } else if (method === 'lifo') {
          ;({ realizedShort: rs, realizedLong: rl } = consumeLifo(openLots, sellShares, sellPrice, t.occurred_at))
        } else if (method === 'hifo') {
          ;({ realizedShort: rs, realizedLong: rl } = consumeHifo(openLots, sellShares, sellPrice, t.occurred_at))
        } else {
          ;({ realizedShort: rs, realizedLong: rl } = consumeAverageCost(openLots, sellShares, sellPrice, t.occurred_at))
        }
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

    let sharesShort = 0
    let sharesLong = 0
    let costBasisShort = 0
    let costBasisLong = 0
    const lotsDetail: LotDetail[] = openLots.map((lot) => {
      const held = daysBetween(lot.buyDate, today)
      const term: 'short' | 'long' = held > LONG_TERM_DAYS ? 'long' : 'short'
      if (term === 'long') {
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
        days_held: held,
        term,
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

const SYSTEM_PROMPT_BASE = `You are the Market Pulse Advisor, a portfolio-aware financial research assistant built for a fractional CFO and investor. You operate with two modes and pick the right one based on the question:

PORTFOLIO CFO MODE (default when user asks about their positions, allocation, sizing, exposure, or "should I"): concise, data-forward, institutional tone. Cite specific tickers from the user's portfolio and watchlist by name. Reference current macro data when relevant. Give concrete recommendations with reasoning, not hedged advice. You can be direct about concerns. When the user asks about their holdings, allocation, sector exposure, or concentration, call get_portfolio to pull live values, gain/loss, lot-level detail, and sector breakdown -- don't make quantitative claims off the light snapshot alone.

TAX-AWARE SELLING: get_portfolio returns per-position lot detail (buy date, cost basis, days held, short vs long term) and ST/LT realized + unrealized splits. When proposing a sell or trim, look at the lots and pick a lotMethod deliberately:
- FIFO: default for stock/etf, often surfaces long-term gains (lower tax rate)
- LIFO: keeps older long-term lots intact, hits newer (usually short-term) lots first
- HIFO: minimizes realized gain by selling highest-cost-basis lots first -- the default move for tax-loss harvesting or when the user wants to defer taxes
- average_cost: required for mutual_fund; rarely the right call for stocks/ETFs with dispersed cost bases
When one method produces materially different tax outcomes than another (e.g. HIFO realizes a loss while FIFO realizes a gain), say so in the rationale and set lotMethod explicitly. If a short-term lot is within weeks of crossing one year, mention it rather than proposing an immediate sale.

RESEARCH COPILOT MODE (when user is exploring a thesis, asking "what do you think about X," or working through an analysis): Socratic, exploratory, suggest angles they haven't considered, play devil's advocate on their thesis, surface counterfactuals and second-order effects.

Tool usage guidance:
- You have tools for live market data. Use them when the answer depends on current numbers.
- Don't call tools for static analysis that doesn't need fresh data. Don't call a tool just to confirm what you already know.
- If the user asks about a ticker, reach for get_quote or research_ticker rather than reciting from memory.
- The portfolio and watchlist snapshots in this system prompt are current as of conversation start. For live values, gain/loss, sector breakdown, or concentration analysis, call get_portfolio. For watchlist refresh, call get_user_watchlist.

Formatting:
- Use markdown. Bold tickers with **SYMBOL**. Use bullets for lists of 3+ items. Use tables sparingly for comparisons.
- Keep responses focused. A tight two-paragraph answer beats a sprawling five.

Always:
- Be specific. Name tickers, cite numbers, reference dates.
- Be honest about uncertainty. When you don't know, say so.
- Prefer decisions over commentary. If asked "should I," give a view.
- Do not remind the user you are an AI. Do not add disclaimers about not being a licensed advisor unless the user asks about regulated advice.`

const TOOLS = [
  {
    name: "get_quote",
    description: "Get the latest available price quote for one or more stock ticker symbols. Returns price, day change, volume. Use when user asks about a ticker's current price or recent movement.",
    input_schema: {
      type: "object",
      properties: {
        symbols: { type: "array", items: { type: "string" }, description: "Array of ticker symbols, 1-10 per call." },
      },
      required: ["symbols"],
    },
  },
  {
    name: "research_ticker",
    description: "Get a full research dossier for a single ticker: company overview, fundamentals, 30-day price history, and a generated investment thesis. Use when the user wants deeper analysis of a specific company. Slower than get_quote (5-10 seconds).",
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string", description: "Single ticker symbol, e.g. 'NVDA'" } },
      required: ["symbol"],
    },
  },
  {
    name: "get_market_overview",
    description: "Get current macro indicators (Fed Funds, 10Y/2Y Treasury, CPI, unemployment, USD/EUR) plus major US index performance (SPY, QQQ, DIA, IWM, TLT, GLD, USO, VNQ). Use when analysis depends on market-wide conditions.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_treasury_snapshot",
    description: "Get current federal fiscal position: total public debt, deficit FYTD, interest expense, and macro context. Use when the user asks about fiscal policy, deficits, or Treasury dynamics.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_news",
    description: "Search recent news articles by category. Returns up to 10 articles with headline, source, and description. Categories: 'business' (markets), 'national' (US politics), 'local' (state-specific), or 'all' (mixed).",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["business", "national", "local", "all"],
          description: "Which news category.",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "get_user_watchlist",
    description: "Get the user's current watchlist with live prices. Use this to refresh the portfolio view mid-conversation.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_portfolio",
    description: "Get the user's actual portfolio: positions with live prices, unrealized gain/loss, asset class and sector allocation, and top-holdings concentration. Use whenever the user asks about their holdings, total value, allocation, exposure, concentration, or what to do with their portfolio. This is distinct from get_user_watchlist -- portfolio means owned positions with cost basis and share count, watchlist means tickers they're just tracking.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "propose_trade",
    description: "Propose a concrete set of portfolio changes for the user to simulate and apply. Use this only when you're making a specific, actionable recommendation after analyzing their portfolio -- e.g. 'trim NVDA, add VXUS for international diversification'. Call get_portfolio first so you know what they actually hold. The user will see an inline proposal card with a Simulate button to preview asset-class and concentration changes, and an Apply button for trim/sell actions. Do NOT use this for general ideas, musings, or exploratory suggestions -- only for concrete trades with specific share counts.",
    input_schema: {
      type: "object",
      properties: {
        rationale: {
          type: "string",
          description: "One to three sentences explaining the thesis behind this set of changes. Surface risk concerns or goals, including any tax reasoning.",
        },
        changes: {
          type: "array",
          description: "1-10 proposed trades. Use 'trim' for reducing an existing position, 'add' for adding to an existing position, 'sell' for fully exiting, 'buy' for a new position.",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["buy", "sell", "trim", "add"] },
              symbol: { type: "string" },
              assetType: { type: "string", enum: ["stock", "etf", "mutual_fund"] },
              shares: { type: "number", description: "Number of shares (fractional supported)." },
              reason: { type: "string", description: "One-sentence reason for this specific change." },
              lotMethod: {
                type: "string",
                enum: ["fifo", "lifo", "hifo", "average_cost"],
                description: "Only used on sell/trim actions. 'fifo' sells oldest shares first (default for stock/etf, often favors long-term gains). 'lifo' sells newest first (keeps older long-term lots intact). 'hifo' sells highest-cost-basis first (minimizes realized gain -- the default for tax-loss harvesting). 'average_cost' uses the weighted-average basis (default and legally required for mutual_fund). Specify explicitly when the tax outcome differs materially between methods -- call it out in the rationale when you do.",
              },
            },
            required: ["action", "symbol", "shares", "reason"],
          },
        },
      },
      required: ["rationale", "changes"],
    },
  },
]

async function callInternalFunction(fnName: string, body: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) return { error: `${fnName} returned ${res.status}: ${text.slice(0, 200)}` }
  try { return JSON.parse(text) } catch { return { error: `${fnName} returned non-JSON` } }
}

async function executeTool(
  toolName: string,
  toolInput: any,
  supabaseAdmin: any,
  userId: string | null,
  anonymousWatchlist: any[] | null,
  anonymousTransactions: any[] | null,
): Promise<string> {
  try {
    switch (toolName) {
      case "get_quote": {
        const symbols = Array.isArray(toolInput?.symbols) ? toolInput.symbols : []
        if (symbols.length === 0) return JSON.stringify({ error: "symbols array required" })
        return JSON.stringify(await callInternalFunction("stock-quote", { symbols: symbols.slice(0, 10) }))
      }
      case "research_ticker": {
        const symbol = String(toolInput?.symbol || "").trim()
        if (!symbol) return JSON.stringify({ error: "symbol required" })
        const result = await callInternalFunction("research-brief", { symbol })
        if (result.history && Array.isArray(result.history)) {
          const h = result.history
          result.historySummary = h.length > 0 ? {
            days: h.length, startDate: h[0].date, endDate: h[h.length - 1].date,
            startPrice: h[0].close, endPrice: h[h.length - 1].close,
            low: Math.min(...h.map((p: any) => p.close)), high: Math.max(...h.map((p: any) => p.close)),
          } : null
          delete result.history
        }
        return JSON.stringify(result)
      }
      case "get_market_overview":
        return JSON.stringify(await callInternalFunction("market-overview", {}))
      case "get_treasury_snapshot": {
        const result = await callInternalFunction("treasury-data", {})
        if (Array.isArray(result.debt) && result.debt.length > 5) {
          result.debtHistoryTrimmed = true
          result.debt = result.debt.slice(0, 5)
        }
        return JSON.stringify(result)
      }
      case "search_news": {
        const category = String(toolInput?.category || "business")
        const result = await callInternalFunction("fetch-news", { category })
        const articles = (result.articles || result.all || []).slice(0, 10).map((a: any) => ({
          title: a.title, source: a.source, publishedAt: a.publishedAt,
          description: (a.description || "").slice(0, 300), tickers: a.tickers, url: a.url,
        }))
        return JSON.stringify({ category, articles })
      }
      case "get_user_watchlist": {
        // Anonymous path: return the passed watchlist enriched with live quotes
        if (!userId) {
          if (!anonymousWatchlist || anonymousWatchlist.length === 0) {
            return JSON.stringify({ watchlist: [], message: "Anonymous session watchlist is empty" })
          }
          const symbols = anonymousWatchlist.map((w) => w.symbol)
          const quotesResult = await callInternalFunction("stock-quote", { symbols })
          const quotes = quotesResult?.quotes || {}
          const enriched = anonymousWatchlist.map((w) => {
            const q = quotes[w.symbol] || null
            return {
              symbol: w.symbol, name: w.name,
              addedPrice: w.added_price ?? w.addedPrice ?? null,
              currentPrice: q?.price ?? null, dayChangePercent: q?.changePercent ?? null,
            }
          })
          return JSON.stringify({ watchlist: enriched, anonymous: true })
        }
        // Authenticated path: read from DB
        const { data: wl } = await supabaseAdmin
          .from("watchlist")
          .select("symbol, name, exchange, added_price, alert_price, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }).limit(30)
        if (!wl || wl.length === 0) return JSON.stringify({ watchlist: [], message: "Watchlist is empty" })
        const symbols = wl.map((w: any) => w.symbol)
        const quotesResult = await callInternalFunction("stock-quote", { symbols })
        const quotes = quotesResult?.quotes || {}
        const enriched = wl.map((w: any) => {
          const q = quotes[w.symbol] || null
          const pnl = q && w.added_price
            ? { absolute: Math.round((q.price - w.added_price) * 100) / 100, percent: Math.round(((q.price - w.added_price) / w.added_price) * 10000) / 100 }
            : null
          return {
            symbol: w.symbol, name: w.name, addedPrice: w.added_price, alertPrice: w.alert_price,
            currentPrice: q?.price ?? null, dayChangePercent: q?.changePercent ?? null, pnlSinceAdded: pnl,
          }
        })
        return JSON.stringify({ watchlist: enriched })
      }
      case "get_portfolio": {
        // Compute current positions from transaction history (authed DB or anon session).
        let txns: Txn[] = []
        if (userId) {
          const { data } = await supabaseAdmin
            .from("transactions")
            .select("id, symbol, name, asset_type, transaction_type, shares, price_per_share, total_amount, occurred_at, notes, lot_method, created_at")
            .eq("user_id", userId)
          txns = data || []
        } else if (anonymousTransactions && anonymousTransactions.length > 0) {
          txns = anonymousTransactions
        }

        const rawPositions = computePositionsFromTransactions(txns)

        if (rawPositions.length === 0) {
          return JSON.stringify({
            positions: [],
            message: userId
              ? "Portfolio is empty -- user has not added any positions yet"
              : "No portfolio in this guest session",
            anonymous: !userId,
          })
        }

        const symbols = [...new Set(rawPositions.map((p) => p.symbol))]
        const [quotesRes, metaRes] = await Promise.all([
          callInternalFunction("stock-quote", { symbols }),
          callInternalFunction("asset-metadata", { symbols }),
        ])
        const quotes = quotesRes?.quotes || {}
        const metadata = metaRes?.metadata || {}

        const round2 = (n: number) => Math.round(n * 100) / 100
        const enriched = rawPositions.map((p: any) => {
          const q = quotes[p.symbol]
          const meta = metadata[p.symbol]
          const shares = Number(p.shares)
          const basis = Number(p.cost_basis_per_share)
          const totalCost = shares * basis
          const price = q?.price ?? null
          const marketValue = price != null ? shares * price : totalCost
          const unrealizedReturn = marketValue - totalCost
          const unrealizedReturnPercent = totalCost > 0
            ? (unrealizedReturn / totalCost) * 100
            : null
          // Unrealized ST/LT split: allocate unrealized gain to each lot based on
          // its cost-basis share, then sum by term.
          const sharesShort = Number(p.shares_short || 0)
          const sharesLong = Number(p.shares_long || 0)
          const costShort = Number(p.cost_basis_short || 0)
          const costLong = Number(p.cost_basis_long || 0)
          const valueShort = price != null ? sharesShort * price : costShort
          const valueLong = price != null ? sharesLong * price : costLong
          const unrealizedShort = valueShort - costShort
          const unrealizedLong = valueLong - costLong
          return {
            symbol: p.symbol,
            name: p.name,
            assetType: p.asset_type,
            sector: meta?.sector || "Uncategorized",
            industry: meta?.industry || null,
            shares,
            costBasisPerShare: round2(basis),
            totalCost: round2(totalCost),
            currentPrice: price != null ? round2(price) : null,
            marketValue: round2(marketValue),
            unrealizedReturn: round2(unrealizedReturn),
            unrealizedReturnPercent: unrealizedReturnPercent != null ? round2(unrealizedReturnPercent) : null,
            unrealizedShortTerm: round2(unrealizedShort),
            unrealizedLongTerm: round2(unrealizedLong),
            sharesShort: round2(sharesShort),
            sharesLong: round2(sharesLong),
            realizedReturn: p.realized_pnl != null ? round2(Number(p.realized_pnl)) : 0,
            realizedShortTerm: p.realized_pnl_short != null ? round2(Number(p.realized_pnl_short)) : 0,
            realizedLongTerm: p.realized_pnl_long != null ? round2(Number(p.realized_pnl_long)) : 0,
            totalDividends: p.total_dividends != null ? round2(Number(p.total_dividends)) : 0,
            dayChangePercent: q?.changePercent ?? null,
            purchaseDate: p.purchase_date,
            notes: p.notes ? String(p.notes).slice(0, 200) : null,
            hasLiveQuote: price != null,
            lots: Array.isArray(p.lots) ? p.lots.map((l: any) => ({
              buyDate: l.buy_date,
              shares: round2(Number(l.shares)),
              costBasisPerShare: round2(Number(l.cost_basis_per_share)),
              totalCost: round2(Number(l.total_cost)),
              daysHeld: l.days_held,
              term: l.term,
            })) : [],
          }
        })

        let totalValue = 0
        let totalCost = 0
        let dayChange = 0
        let prevDayValue = 0
        let unpricedCount = 0
        for (const p of enriched) {
          totalCost += p.totalCost
          totalValue += p.marketValue
          if (!p.hasLiveQuote) {
            unpricedCount += 1
          } else if (p.dayChangePercent != null && p.currentPrice != null) {
            const prevPrice = p.currentPrice / (1 + p.dayChangePercent / 100)
            const prevValue = p.shares * prevPrice
            dayChange += (p.marketValue - prevValue)
            prevDayValue += prevValue
          }
        }
        const totalReturn = totalValue - totalCost
        const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : null
        const dayChangePercent = prevDayValue > 0 ? (dayChange / prevDayValue) * 100 : null

        for (const p of enriched) {
          ;(p as any).percentOfPortfolio = totalValue > 0
            ? round2((p.marketValue / totalValue) * 100)
            : 0
        }

        const byAssetClassMap: Record<string, { value: number; count: number }> = {}
        const bySectorMap: Record<string, { value: number; count: number }> = {}
        for (const p of enriched) {
          if (!byAssetClassMap[p.assetType]) byAssetClassMap[p.assetType] = { value: 0, count: 0 }
          byAssetClassMap[p.assetType].value += p.marketValue
          byAssetClassMap[p.assetType].count += 1
          if (!bySectorMap[p.sector]) bySectorMap[p.sector] = { value: 0, count: 0 }
          bySectorMap[p.sector].value += p.marketValue
          bySectorMap[p.sector].count += 1
        }
        const byAssetClass = Object.entries(byAssetClassMap)
          .map(([key, v]) => ({
            class: key,
            value: round2(v.value),
            percent: totalValue > 0 ? round2((v.value / totalValue) * 100) : 0,
            positionCount: v.count,
          }))
          .sort((a, b) => b.value - a.value)
        const bySector = Object.entries(bySectorMap)
          .map(([key, v]) => ({
            sector: key,
            value: round2(v.value),
            percent: totalValue > 0 ? round2((v.value / totalValue) * 100) : 0,
            positionCount: v.count,
          }))
          .sort((a, b) => b.value - a.value)

        const sorted = [...enriched].sort((a, b) => b.marketValue - a.marketValue)
        const topHoldings = sorted.slice(0, 5).map((p) => ({
          symbol: p.symbol,
          value: p.marketValue,
          percent: (p as any).percentOfPortfolio,
        }))
        const top3Percent = topHoldings.slice(0, 3).reduce((s, h) => s + h.percent, 0)

        // Portfolio-level ST/LT unrealized + realized aggregates -- lets the
        // advisor reason about tax-efficient selling without walking the lots.
        let unrealizedShortTerm = 0
        let unrealizedLongTerm = 0
        let realizedShortTerm = 0
        let realizedLongTerm = 0
        for (const p of enriched) {
          unrealizedShortTerm += p.unrealizedShortTerm
          unrealizedLongTerm += p.unrealizedLongTerm
          realizedShortTerm += p.realizedShortTerm
          realizedLongTerm += p.realizedLongTerm
        }

        return JSON.stringify({
          totalPositions: enriched.length,
          aggregates: {
            totalValue: round2(totalValue),
            totalCost: round2(totalCost),
            totalReturn: round2(totalReturn),
            totalReturnPercent: totalReturnPercent != null ? round2(totalReturnPercent) : null,
            dayChange: round2(dayChange),
            dayChangePercent: dayChangePercent != null ? round2(dayChangePercent) : null,
            unpricedCount,
            unrealizedShortTerm: round2(unrealizedShortTerm),
            unrealizedLongTerm: round2(unrealizedLongTerm),
            realizedShortTerm: round2(realizedShortTerm),
            realizedLongTerm: round2(realizedLongTerm),
          },
          positions: enriched,
          allocation: { byAssetClass, bySector },
          concentration: { topHoldings, top3Percent: round2(top3Percent) },
          anonymous: !userId,
        })
      }
      case "propose_trade": {
        const rationale = String(toolInput?.rationale || '').slice(0, 1000)
        const rawChanges = Array.isArray(toolInput?.changes) ? toolInput.changes : []
        if (rawChanges.length === 0) {
          return JSON.stringify({ error: "At least one change required in 'changes' array" })
        }
        if (rawChanges.length > 10) {
          return JSON.stringify({ error: "Too many changes (max 10 per proposal)" })
        }
        const allowedActions = new Set(["buy", "sell", "trim", "add"])
        const normalized = rawChanges
          .map((c: any) => {
            const lm = c.lotMethod ? String(c.lotMethod).toLowerCase() : null
            const validLotMethods = new Set(['fifo', 'lifo', 'hifo', 'average_cost'])
            return {
              action: String(c.action || '').toLowerCase(),
              symbol: String(c.symbol || '').toUpperCase(),
              assetType: String(c.assetType || c.asset_type || 'stock'),
              shares: Number(c.shares) || 0,
              reason: String(c.reason || '').slice(0, 300),
              lotMethod: lm && validLotMethods.has(lm) ? lm : null,
            }
          })
          .filter((c: any) =>
            c.symbol && c.shares > 0 && allowedActions.has(c.action)
          )
        if (normalized.length === 0) {
          return JSON.stringify({ error: "No valid changes after normalization -- check action values and share counts" })
        }
        // The tool response is what the model sees; the UI reads tool_input directly.
        return JSON.stringify({
          status: "proposal_sent",
          message: "Proposal rendered in the UI. User can Simulate to preview impact, Apply (trim/sell only) to commit, or Dismiss.",
          rationale,
          changeCount: normalized.length,
          changes: normalized,
        })
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({ error: String((err as Error).message || err) })
  }
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "n/a"
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toFixed(2)}`
}

async function buildPortfolioSnapshot(
  supabaseAdmin: any,
  userId: string | null,
  anonymousWatchlist: any[] | null,
  anonymousTransactions: any[] | null,
): Promise<string> {
  const parts: string[] = []
  const today = new Date().toISOString().slice(0, 10)
  parts.push(`TODAY: ${today}`)

  // Anonymous user: use watchlist passed in body, no bench
  if (!userId) {
    parts.push("")
    parts.push("SESSION TYPE: anonymous (guest user, not signed in)")
    parts.push("")
    if (anonymousWatchlist && anonymousWatchlist.length > 0) {
      parts.push(`SESSION WATCHLIST (${anonymousWatchlist.length} tickers, not saved):`)
      for (const w of anonymousWatchlist) {
        const price = w.added_price ?? w.addedPrice
        const addedAt = price ? ` added at ${formatCurrency(Number(price))}` : ""
        parts.push(`- ${w.symbol}${w.name ? ` (${w.name})` : ""}${addedAt}`)
      }
    } else {
      parts.push("SESSION WATCHLIST: empty (user has not added any tickers yet)")
    }
    const anonPositions = anonymousTransactions && anonymousTransactions.length > 0
      ? computePositionsFromTransactions(anonymousTransactions)
      : []
    if (anonPositions.length > 0) {
      let totalCost = 0
      for (const p of anonPositions) {
        totalCost += Number(p.shares) * Number(p.cost_basis_per_share)
      }
      parts.push("")
      parts.push(`SESSION PORTFOLIO (${anonPositions.length} positions, $${totalCost.toFixed(0)} cost basis, not saved -- call get_portfolio for live values):`)
      for (const p of anonPositions) {
        const typeLabel = p.asset_type === 'mutual_fund' ? 'mutual fund' : p.asset_type
        parts.push(`- ${p.symbol}${p.name ? ` (${p.name})` : ""}: ${Number(p.shares)} shares @ $${Number(p.cost_basis_per_share).toFixed(2)} (${typeLabel})`)
      }
    }
    parts.push("")
    parts.push("NOTE: Guest user has no saved research bench. Session data above disappears on refresh.")
    return parts.join("\n")
  }

  // Authenticated path
  try {
    const { data: watchlist } = await supabaseAdmin
      .from("watchlist")
      .select("symbol, name, exchange, added_price, alert_price, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(30)
    if (watchlist && watchlist.length > 0) {
      parts.push("")
      parts.push(`USER WATCHLIST (${watchlist.length} tickers):`)
      for (const w of watchlist) {
        const addedAt = w.added_price ? ` added at ${formatCurrency(w.added_price)}` : ""
        const alert = w.alert_price ? ` alert @ ${formatCurrency(w.alert_price)}` : ""
        parts.push(`- ${w.symbol}${w.name ? ` (${w.name})` : ""}${addedAt}${alert}`)
      }
    } else {
      parts.push("")
      parts.push("USER WATCHLIST: empty")
    }
  } catch (_) {
    parts.push("USER WATCHLIST: unavailable")
  }

  try {
    const { data: bench } = await supabaseAdmin
      .from("research_bench")
      .select("symbol, name, sector, status, notes, updated_at")
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(20)
    if (bench && bench.length > 0) {
      parts.push("")
      parts.push(`RESEARCH BENCH (${bench.length} items):`)
      for (const b of bench) {
        const note = b.notes ? ` -- ${b.notes.slice(0, 120)}` : ""
        parts.push(`- ${b.symbol} [${b.status}]${b.sector ? ` (${b.sector})` : ""}${note}`)
      }
    }
  } catch (_) { /* silent */ }

  try {
    const { data: txns } = await supabaseAdmin
      .from("transactions")
      .select("id, symbol, name, asset_type, transaction_type, shares, price_per_share, total_amount, occurred_at, notes, lot_method, created_at")
      .eq("user_id", userId)
    const computed = computePositionsFromTransactions(txns || [])
    if (computed.length > 0) {
      let totalCost = 0
      for (const p of computed) {
        totalCost += Number(p.shares) * Number(p.cost_basis_per_share)
      }
      parts.push("")
      parts.push(`USER PORTFOLIO (${computed.length} positions, $${totalCost.toFixed(0)} cost basis -- call get_portfolio for live values, gain/loss, sector breakdown):`)
      for (const p of computed.slice(0, 30)) {
        const typeLabel = p.asset_type === 'mutual_fund' ? 'mutual fund' : p.asset_type
        parts.push(`- ${p.symbol}${p.name ? ` (${p.name})` : ""}: ${Number(p.shares)} shares @ $${Number(p.cost_basis_per_share).toFixed(2)} (${typeLabel})`)
      }
    }
  } catch (_) { /* silent */ }

  return parts.join("\n")
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Dual-mode auth: if token present, resolve user; if absent, treat as anonymous
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "")

    let userId: string | null = null
    if (token) {
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
      if (!userErr && userData.user) {
        userId = userData.user.id
      }
      // If token present but invalid, we still fall through to anonymous mode.
      // This is permissive by design: expired tokens degrade gracefully.
    }

    const body = await req.json()
    const {
      conversationId: incomingConvId,
      userMessage,
      modelKey = "sonnet",
      anonymousContext,
      priorMessages,
    } = body as {
      conversationId?: string
      userMessage: string
      modelKey?: "sonnet" | "opus" | "haiku"
      anonymousContext?: { watchlist?: any[]; transactions?: any[] }
      priorMessages?: Array<{ role: string; content: string }>
    }

    if (!userMessage || !userMessage.trim()) {
      return new Response(JSON.stringify({ error: "Empty message" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const modelId = MODEL_IDS[modelKey] || MODEL_IDS.sonnet
    const anonymousWatchlist = anonymousContext?.watchlist || null
    const anonymousTransactions = anonymousContext?.transactions || null

    // Conversation handling: authenticated writes to DB, anonymous works in memory
    let conversationId = incomingConvId
    if (userId) {
      if (!conversationId) {
        const { data: newConv, error: convErr } = await supabaseAdmin
          .from("advisor_conversations")
          .insert({ user_id: userId, title: userMessage.slice(0, 60), model: modelKey })
          .select().single()
        if (convErr) throw convErr
        conversationId = newConv.id
      }
      await supabaseAdmin.from("advisor_messages").insert({
        conversation_id: conversationId, user_id: userId, role: "user", content: userMessage,
      })
    }

    // Build message history
    let claudeMessages: any[] = []
    if (userId) {
      const { data: history } = await supabaseAdmin
        .from("advisor_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }).limit(40)
      claudeMessages = (history || [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({ role: m.role, content: m.content }))
    } else {
      // Anonymous: accept prior messages from client (session state) + the new user message
      claudeMessages = (priorMessages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }))
      claudeMessages.push({ role: "user", content: userMessage })
    }

    const snapshot = await buildPortfolioSnapshot(supabaseAdmin, userId, anonymousWatchlist, anonymousTransactions)
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n=== PORTFOLIO CONTEXT ===\n${snapshot}\n=== END CONTEXT ===`

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not set")

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        emit("meta", { conversationId: conversationId || null, anonymous: !userId })

        let finalAssistantText = ""
        let totalInputTokens = 0
        let totalOutputTokens = 0
        let toolCallCount = 0
        const toolCallsLog: any[] = []

        try {
          for (let loop = 0; loop < MAX_LOOPS; loop++) {
            const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
              body: JSON.stringify({
                model: modelId, max_tokens: 2048, system: systemPrompt,
                messages: claudeMessages, tools: TOOLS, stream: true,
              }),
            })

            if (!claudeRes.ok || !claudeRes.body) {
              const errText = await claudeRes.text()
              emit("error", { error: `Claude API error (${claudeRes.status}): ${errText.slice(0, 300)}` })
              break
            }

            const reader = claudeRes.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            const contentBlocks: any[] = []
            let stopReason: string | null = null
            let turnInputTokens = 0
            let turnOutputTokens = 0

            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split("\n")
              buffer = lines.pop() || ""
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                const payload = line.slice(6).trim()
                if (!payload || payload === "[DONE]") continue
                try {
                  const evt = JSON.parse(payload)
                  if (evt.type === "message_start" && evt.message?.usage) {
                    turnInputTokens = evt.message.usage.input_tokens || 0
                  } else if (evt.type === "content_block_start") {
                    const block = evt.content_block
                    contentBlocks[evt.index] = block.type === "text"
                      ? { type: "text", text: "" }
                      : block.type === "tool_use"
                      ? { type: "tool_use", id: block.id, name: block.name, input: {}, inputJson: "" }
                      : { type: block.type }
                  } else if (evt.type === "content_block_delta") {
                    const block = contentBlocks[evt.index]
                    if (!block) continue
                    if (evt.delta.type === "text_delta" && block.type === "text") {
                      const chunk = evt.delta.text as string
                      block.text += chunk
                      emit("delta", { text: chunk })
                    } else if (evt.delta.type === "input_json_delta" && block.type === "tool_use") {
                      block.inputJson += evt.delta.partial_json || ""
                    }
                  } else if (evt.type === "content_block_stop") {
                    const block = contentBlocks[evt.index]
                    if (block?.type === "tool_use" && block.inputJson) {
                      try { block.input = JSON.parse(block.inputJson) } catch { block.input = {} }
                    }
                  } else if (evt.type === "message_delta") {
                    if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
                    if (evt.usage?.output_tokens != null) turnOutputTokens = evt.usage.output_tokens
                  }
                } catch (_) { /* ignore */ }
              }
            }

            totalInputTokens += turnInputTokens
            totalOutputTokens += turnOutputTokens

            const turnText = contentBlocks.filter((b) => b?.type === "text").map((b) => b.text).join("")
            if (turnText) finalAssistantText += (finalAssistantText ? "\n\n" : "") + turnText

            if (stopReason !== "tool_use") break

            const toolUses = contentBlocks.filter((b) => b?.type === "tool_use")
            if (toolUses.length === 0) break

            const cleanContent = contentBlocks
              .filter((b) => b?.type === "text" || b?.type === "tool_use")
              .map((b) => {
                if (b.type === "text") return { type: "text", text: b.text }
                if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input || {} }
                return b
              })
            claudeMessages.push({ role: "assistant", content: cleanContent })

            const toolResults: any[] = []
            for (const tu of toolUses) {
              toolCallCount++
              if (toolCallCount > MAX_TOOL_CALLS) {
                emit("tool_call", { id: tu.id, name: tu.name, input: tu.input, status: "skipped" })
                toolResults.push({
                  type: "tool_result", tool_use_id: tu.id,
                  content: JSON.stringify({ error: "Tool call limit reached. Answer with data collected so far." }),
                  is_error: true,
                })
                continue
              }
              emit("tool_call", { id: tu.id, name: tu.name, input: tu.input, status: "running" })
              const resultStr = await executeTool(tu.name, tu.input, supabaseAdmin, userId, anonymousWatchlist, anonymousTransactions)
              let resultParsed: any = null
              try { resultParsed = JSON.parse(resultStr) } catch { resultParsed = { raw: resultStr } }
              const isErr = resultParsed?.error != null
              emit("tool_result", { id: tu.id, name: tu.name, status: isErr ? "error" : "ok", summary: summarizeToolResult(tu.name, resultParsed) })
              toolCallsLog.push({ name: tu.name, input: tu.input, error: resultParsed?.error || null })
              toolResults.push({
                type: "tool_result", tool_use_id: tu.id, content: resultStr, is_error: isErr,
              })
            }
            claudeMessages.push({ role: "user", content: toolResults })
          }
        } catch (err) {
          emit("error", { error: String((err as Error).message || err) })
        }

        // Persist only for authenticated users
        if (userId && finalAssistantText) {
          await supabaseAdmin.from("advisor_messages").insert({
            conversation_id: conversationId, user_id: userId, role: "assistant",
            content: finalAssistantText, model: modelKey,
            input_tokens: totalInputTokens, output_tokens: totalOutputTokens,
          })
        }

        emit("done", { ok: true, toolCalls: toolCallsLog.length, anonymous: !userId })
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders, "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache", "Connection": "keep-alive",
      },
    })
  } catch (e) {
    const msg = String((e as Error).message || e)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})

function summarizeToolResult(toolName: string, result: any): string {
  if (!result) return "no result"
  if (result.error) return `error: ${String(result.error).slice(0, 80)}`
  switch (toolName) {
    case "get_quote": {
      const quotes = result.quotes || {}
      const syms = Object.keys(quotes)
      if (syms.length === 0) return "no quotes returned"
      if (syms.length === 1) {
        const q = quotes[syms[0]]
        return `${syms[0]} $${q?.price?.toFixed?.(2) ?? "?"} (${q?.changePercent >= 0 ? "+" : ""}${q?.changePercent?.toFixed?.(2) ?? "?"}%)`
      }
      return `${syms.length} quotes: ${syms.join(", ")}`
    }
    case "research_ticker":
      return `${result.symbol} dossier`
    case "get_market_overview": {
      const ind = (result.indices || []).length
      const mac = (result.macro || []).length
      return `${mac} macro series, ${ind} indices`
    }
    case "get_treasury_snapshot": return "fiscal snapshot"
    case "search_news": return `${(result.articles || []).length} ${result.category || ""} articles`
    case "get_user_watchlist": {
      const n = (result.watchlist || []).length
      return result.anonymous ? `${n} session positions` : `${n} positions`
    }
    case "get_portfolio": {
      const n = result.totalPositions ?? 0
      if (n === 0) return "portfolio empty"
      const value = result.aggregates?.totalValue
      const ret = result.aggregates?.totalReturnPercent
      const valStr = value != null ? `$${Math.round(value).toLocaleString()}` : "?"
      const retStr = ret != null ? `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%` : "?"
      return `${n} positions, ${valStr} (${retStr})`
    }
    case "propose_trade": {
      const n = result.changeCount ?? 0
      return n === 1 ? "1 proposed change" : `${n} proposed changes`
    }
    default: return "ok"
  }
}