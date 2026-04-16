// Supabase Edge Function: market-overview
// Runtime: Deno
//
// Fetches macro indicators from FRED and major index data
// from Polygon. Returns a unified overview for the Market
// Overview tab.
//
// Secrets: FRED_API_KEY, MASSIVE_API_KEY
//
// POST /functions/v1/market-overview
// Body: {} (no params needed)
// Response: { macro, indices, asOf }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

// FRED series we care about
const FRED_SERIES = [
  { id: 'FEDFUNDS', label: 'Fed Funds Rate', suffix: '%', decimals: 2 },
  { id: 'DGS10', label: '10-Year Treasury', suffix: '%', decimals: 2 },
  { id: 'DGS2', label: '2-Year Treasury', suffix: '%', decimals: 2 },
  { id: 'CPIAUCSL', label: 'CPI (All Urban)', suffix: '', decimals: 1 },
  { id: 'UNRATE', label: 'Unemployment Rate', suffix: '%', decimals: 1 },
  { id: 'DEXUSEU', label: 'USD/EUR', suffix: '', decimals: 4 },
]

// Major indices to track via Polygon
const INDICES = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
  { symbol: 'DIA', label: 'Dow Jones (DIA)' },
  { symbol: 'IWM', label: 'Russell 2000 (IWM)' },
  { symbol: 'TLT', label: '20+ Year Treasury (TLT)' },
  { symbol: 'GLD', label: 'Gold (GLD)' },
  { symbol: 'USO', label: 'Crude Oil (USO)' },
  { symbol: 'VNQ', label: 'Real Estate (VNQ)' },
]

// --- FRED: fetch latest observation ---
async function fetchFredSeries(
  apiKey: string,
  seriesId: string,
): Promise<{ value: number | null; date: string | null }> {
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[market-overview] FRED ${seriesId}: ${res.status}`)
      return { value: null, date: null }
    }
    const data = await res.json()
    const obs = data.observations || []
    // Find first non-missing value
    for (const o of obs) {
      if (o.value && o.value !== '.') {
        return { value: parseFloat(o.value), date: o.date }
      }
    }
    return { value: null, date: null }
  } catch (err) {
    console.warn(`[market-overview] FRED ${seriesId} error:`, err)
    return { value: null, date: null }
  }
}

// --- Polygon: fetch previous close ---
async function fetchIndexQuote(
  apiKey: string,
  symbol: string,
): Promise<{
  price: number | null
  change: number | null
  changePercent: number | null
}> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return { price: null, change: null, changePercent: null }
    const data = await res.json()
    if (!data.results || data.results.length === 0) {
      return { price: null, change: null, changePercent: null }
    }
    const r = data.results[0]
    const change = r.c - r.o
    const changePercent = r.o > 0 ? (change / r.o) * 100 : 0
    return {
      price: r.c,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
    }
  } catch {
    return { price: null, change: null, changePercent: null }
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

  const fredKey = Deno.env.get('FRED_API_KEY')
  const polygonKey = Deno.env.get('MASSIVE_API_KEY')

  if (!fredKey || !polygonKey) {
    return new Response(
      JSON.stringify({ error: 'API keys not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Fetch all FRED series and index quotes in parallel
    const [fredResults, indexResults] = await Promise.all([
      Promise.all(
        FRED_SERIES.map(async (series) => {
          const obs = await fetchFredSeries(fredKey, series.id)
          return { ...series, ...obs }
        }),
      ),
      Promise.all(
        INDICES.map(async (idx) => {
          const quote = await fetchIndexQuote(polygonKey, idx.symbol)
          return { ...idx, ...quote }
        }),
      ),
    ])

    return new Response(
      JSON.stringify({
        macro: fredResults,
        indices: indexResults,
        asOf: new Date().toISOString(),
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[market-overview] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})