// Supabase Edge Function: stock-quote
// Runtime: Deno
//
// Fetches real-time stock quotes from Polygon.io (Massive).
// API key lives server-side as a Supabase secret.
//
// Secrets required: MASSIVE_API_KEY
//
// POST /functions/v1/stock-quote
// Body: { symbols: ["AAPL", "MSFT", ...] }
// Response: { quotes: { AAPL: {...}, MSFT: {...} } }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PolygonPrevClose {
  T: string    // ticker
  c: number    // close
  o: number    // open
  h: number    // high
  l: number    // low
  v: number    // volume
  vw: number   // volume-weighted avg price
}

interface QuoteResult {
  symbol: string
  price: number
  open: number
  high: number
  low: number
  volume: number
  change: number
  changePercent: number
  asOf: string
}

async function fetchQuotes(
  apiKey: string,
  symbols: string[],
): Promise<Record<string, QuoteResult>> {
  const quotes: Record<string, QuoteResult> = {}

  // Polygon's grouped daily endpoint gets previous close for ALL tickers
  // in one call. Much more efficient than per-ticker calls.
  // But on free tier it's delayed 15 min and only gives prev day close.
  // For a CFO watchlist tool, that's fine.
  //
  // Alternative: /v2/snapshot/locale/us/markets/stocks/tickers
  // gives real snapshots but requires a paid plan.
  //
  // We'll use per-ticker /v2/aggs/ticker/{}/prev for free tier.
  // Rate limit is 5 req/min on free. For a watchlist of 10-15 tickers
  // we batch with Promise.allSettled and handle partial failures.

  const fetchOne = async (symbol: string): Promise<[string, QuoteResult | null]> => {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[stock-quote] ${symbol}: ${res.status}`)
        return [symbol, null]
      }
      const data = await res.json()
      if (!data.results || data.results.length === 0) {
        console.warn(`[stock-quote] ${symbol}: no results`)
        return [symbol, null]
      }
      const r = data.results[0] as PolygonPrevClose
      const change = r.c - r.o
      const changePercent = r.o > 0 ? (change / r.o) * 100 : 0
      return [symbol, {
        symbol: r.T || symbol,
        price: r.c,
        open: r.o,
        high: r.h,
        low: r.l,
        volume: r.v,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        asOf: new Date().toISOString(),
      }]
    } catch (err) {
      console.warn(`[stock-quote] ${symbol} error:`, err)
      return [symbol, null]
    }
  }

  // Fetch all in parallel (Polygon free tier = 5/min, so keep watchlists small)
  const results = await Promise.allSettled(
    symbols.map((s) => fetchOne(s.toUpperCase())),
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const [sym, quote] = result.value
      if (quote) quotes[sym] = quote
    }
  }

  return quotes
}

// --- Company name lookup ---
async function lookupTicker(
  apiKey: string,
  symbol: string,
): Promise<{ name: string; exchange: string } | null> {
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${symbol.toUpperCase()}?apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results) return null
    return {
      name: data.results.name || symbol,
      exchange: data.results.primary_exchange || '',
    }
  } catch {
    return null
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

  let body: { symbols?: string[]; lookup?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Lookup mode: get company name + exchange for a single ticker
    if (body.lookup) {
      const info = await lookupTicker(apiKey, body.lookup)
      if (!info) {
        return new Response(
          JSON.stringify({ error: `Ticker not found: ${body.lookup}` }),
          { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }
      // Also get the current price
      const quotes = await fetchQuotes(apiKey, [body.lookup])
      const quote = quotes[body.lookup.toUpperCase()] || null
      return new Response(
        JSON.stringify({ ...info, quote }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Quotes mode: get prices for multiple tickers
    const symbols = body.symbols || []
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'symbols array is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Cap at 20 to stay within rate limits
    const capped = symbols.slice(0, 20)
    const quotes = await fetchQuotes(apiKey, capped)
    return new Response(
      JSON.stringify({ quotes }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[stock-quote] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})