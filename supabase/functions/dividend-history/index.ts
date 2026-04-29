// Supabase Edge Function: dividend-history
// Runtime: Deno
//
// Returns dividend history + computed metrics for a list of symbols.
// Uses Polygon's free-tier reference endpoint /v3/reference/dividends.
//
// Secrets required: MASSIVE_API_KEY
//
// POST /functions/v1/dividend-history
// Body: { symbols: ["AAPL", "MSFT", ...] }
// Response: { dividends: { AAPL: { hasDividends, latestAmount, ... } } }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Polygon's frequency code -> human-readable label.
const FREQUENCY_LABEL: Record<number, string> = {
  0: 'Irregular',
  1: 'Annual',
  2: 'Semi-Annual',
  4: 'Quarterly',
  12: 'Monthly',
}

interface DividendEvent {
  cashAmount: number
  exDate: string | null
  payDate: string | null
  declarationDate: string | null
  recordDate: string | null
  frequency: number
}

interface DividendSummary {
  symbol: string
  hasDividends: boolean
  latestAmount: number | null
  latestExDate: string | null
  latestPayDate: string | null
  frequency: number
  frequencyLabel: string
  annualizedAmount: number
  growth5y: number | null
  paymentsLast5y: number
  expectedLast5y: number
  events: DividendEvent[]
}

function emptySummary(symbol: string): DividendSummary {
  return {
    symbol,
    hasDividends: false,
    latestAmount: null,
    latestExDate: null,
    latestPayDate: null,
    frequency: 0,
    frequencyLabel: FREQUENCY_LABEL[0],
    annualizedAmount: 0,
    growth5y: null,
    paymentsLast5y: 0,
    expectedLast5y: 0,
    events: [],
  }
}

function daysAgo(iso: string | null): number {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

// CAGR over the period from earliest in-window to latest. Null when fewer
// than two years separate the bookends -- with too little spread the
// annualized number is meaningless.
function compoundGrowthRate(events: DividendEvent[], yearsBack = 5): number | null {
  if (events.length < 2) return null
  const cutoff = Date.now() - yearsBack * 365 * 24 * 60 * 60 * 1000
  const inWindow = events.filter(
    (e) => e.exDate && new Date(e.exDate).getTime() >= cutoff
  )
  if (inWindow.length < 2) return null

  // Events are newest-first from Polygon; flip for chronological math.
  const chrono = [...inWindow].reverse()
  const earliest = chrono[0]
  const latest = chrono[chrono.length - 1]
  if (!earliest.exDate || !latest.exDate) return null
  const yearsBetween =
    (new Date(latest.exDate).getTime() - new Date(earliest.exDate).getTime()) /
    (365 * 24 * 60 * 60 * 1000)
  if (yearsBetween < 2) return null
  if (earliest.cashAmount <= 0) return null
  return Math.pow(latest.cashAmount / earliest.cashAmount, 1 / yearsBetween) - 1
}

async function fetchOne(
  apiKey: string,
  symbol: string,
): Promise<[string, DividendSummary]> {
  try {
    const url = `https://api.polygon.io/v3/reference/dividends?ticker=${symbol.toUpperCase()}&limit=50&order=desc&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[dividend-history] ${symbol}: ${res.status}`)
      return [symbol, emptySummary(symbol)]
    }
    const data = await res.json()
    const results = Array.isArray(data?.results) ? data.results : []
    if (results.length === 0) return [symbol, emptySummary(symbol)]

    const events: DividendEvent[] = results
      .filter((r: any) => Number.isFinite(Number(r.cash_amount)))
      .map((r: any) => ({
        cashAmount: Number(r.cash_amount),
        exDate: r.ex_dividend_date || null,
        payDate: r.pay_date || null,
        declarationDate: r.declaration_date || null,
        recordDate: r.record_date || null,
        frequency: Number(r.frequency) || 0,
      }))

    if (events.length === 0) return [symbol, emptySummary(symbol)]

    const latest = events[0]
    const frequency = Number(latest.frequency) || 0
    const annualizedAmount = frequency > 0 ? latest.cashAmount * frequency : 0
    const growth5y = compoundGrowthRate(events, 5)
    const fiveYearsAgo = Date.now() - 5 * 365 * 24 * 60 * 60 * 1000
    const paymentsLast5y = events.filter(
      (e) => e.exDate && new Date(e.exDate).getTime() >= fiveYearsAgo
    ).length
    const expectedLast5y = frequency > 0 ? frequency * 5 : 0

    return [symbol, {
      symbol: symbol.toUpperCase(),
      hasDividends: true,
      latestAmount: latest.cashAmount,
      latestExDate: latest.exDate,
      latestPayDate: latest.payDate,
      frequency,
      frequencyLabel: FREQUENCY_LABEL[frequency] || `Every ${frequency}/yr`,
      annualizedAmount,
      growth5y,
      paymentsLast5y,
      expectedLast5y,
      // Cap event list so the response stays small for advisor token budgets.
      events: events.slice(0, 20),
    }]
  } catch (err) {
    console.warn(`[dividend-history] ${symbol} error:`, err)
    return [symbol, emptySummary(symbol)]
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('MASSIVE_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'MASSIVE_API_KEY not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  let body: { symbols?: string[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const symbols = body.symbols || []
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return new Response(
      JSON.stringify({ error: 'symbols array is required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  // Cap to stay within Polygon's free-tier rate ceiling.
  const capped = symbols.slice(0, 20)
  try {
    const results = await Promise.allSettled(capped.map((s) => fetchOne(apiKey, s)))
    const dividends: Record<string, DividendSummary> = {}
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [sym, summary] = result.value
        dividends[sym.toUpperCase()] = summary
      }
    }
    return new Response(JSON.stringify({ dividends }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[dividend-history] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
