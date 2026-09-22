// Supabase Edge Function: hourly-scoreboard
// Runtime: Deno
//
// Hourly Wire / Dashboard scoreboard: rates (FRED), risk ETFs (Polygon),
// geopolitics headlines (news_articles or NewsData), silent+regime flags.
//
// Secrets: FRED_API_KEY, MASSIVE_API_KEY
// Optional: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (news_articles)
// Optional: NEWSDATA_KEY (fallback geopolitics)
//
// Silent when:
//   abs(SPY move) < 0.35 && abs(QQQ move) < 0.45
//   && |DGS10 changeBp| < 3 (or null) && no geopolitics hits
//   where move = change1hPct ?? changeSessionPct ?? 0
//
// Deploy:
//   supabase functions deploy hourly-scoreboard
//
// curl example:
//   curl -X POST "$SUPABASE_URL/functions/v1/hourly-scoreboard" \
//     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
//     -H "apikey: $SUPABASE_ANON_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{}'

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const POLYGON_BASE = 'https://api.polygon.io'
const NEWSDATA_BASE = 'https://newsdata.io/api/1'

const FRED_SERIES = [
  { id: 'DGS10', label: '10-Year Treasury', unit: '%' },
  { id: 'DGS2', label: '2-Year Treasury', unit: '%' },
  { id: 'T10Y2Y', label: '10Y\u20132Y Spread', unit: 'pp' },
]

const RISK_SYMBOLS = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
  { symbol: 'TLT', label: '20+ Year Treasury (TLT)' },
  { symbol: 'HYG', label: 'High Yield Corp (HYG)' },
  { symbol: 'GLD', label: 'Gold (GLD)' },
  { symbol: 'USO', label: 'Crude Oil (USO)' },
  { symbol: 'UUP', label: 'US Dollar (UUP)' },
  { symbol: 'VIXY', label: 'Short-Term VIX (VIXY)' },
]

const GEO_KEYWORDS: Array<{ term: string; weight: number }> = [
  { term: 'fed', weight: 2 },
  { term: 'fomc', weight: 3 },
  { term: 'powell', weight: 2 },
  { term: 'rate hike', weight: 3 },
  { term: 'rate cut', weight: 3 },
  { term: 'yield', weight: 1 },
  { term: 'treasury', weight: 1 },
  { term: 'war', weight: 2 },
  { term: 'iran', weight: 2 },
  { term: 'israel', weight: 2 },
  { term: 'ukraine', weight: 2 },
  { term: 'gaza', weight: 2 },
  { term: 'oil', weight: 1 },
  { term: 'opec', weight: 2 },
  { term: 'tariff', weight: 2 },
  { term: 'sanction', weight: 2 },
  { term: 'ceasefire', weight: 2 },
  { term: 'missile', weight: 2 },
  { term: 'strike', weight: 1 },
  { term: 'invasion', weight: 3 },
]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// --- FRED: last ~5 obs, two non-missing for changeBp ---
async function fetchFredRate(
  apiKey: string,
  series: { id: string; label: string; unit: string },
): Promise<{
  id: string
  label: string
  value: number | null
  unit: string
  changeBp: number | null
  asOfDate: string | null
} | null> {
  try {
    const url =
      `${FRED_BASE}?series_id=${series.id}&api_key=${apiKey}` +
      `&file_type=json&sort_order=desc&limit=5`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[hourly-scoreboard] FRED ${series.id}: ${res.status}`)
      return null
    }
    const data = await res.json()
    const obs = (data.observations || []).filter(
      (o: { value: string }) => o.value && o.value !== '.',
    )
    if (obs.length === 0) return null

    const latest = parseFloat(obs[0].value)
    let changeBp: number | null = null
    if (obs.length >= 2) {
      const prev = parseFloat(obs[1].value)
      // Yields already in %; difference * 100 \u2192 basis points
      changeBp = round2((latest - prev) * 100)
    }

    return {
      id: series.id,
      label: series.label,
      value: round2(latest),
      unit: series.unit,
      changeBp,
      asOfDate: obs[0].date || null,
    }
  } catch (err) {
    console.warn(`[hourly-scoreboard] FRED ${series.id} error:`, err)
    return null
  }
}

// --- Polygon: minute aggs for 1h change, prev for session fallback ---
interface RiskLine {
  symbol: string
  label: string
  price: number | null
  change1hPct: number | null
  changeSessionPct: number | null
  asOf: string
}

async function fetchPrev(
  apiKey: string,
  symbol: string,
): Promise<{ price: number; open: number; changeSessionPct: number } | null> {
  try {
    const url =
      `${POLYGON_BASE}/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results?.length) return null
    const r = data.results[0]
    const changeSessionPct = r.o > 0 ? ((r.c - r.o) / r.o) * 100 : 0
    return {
      price: r.c,
      open: r.o,
      changeSessionPct: round2(changeSessionPct),
    }
  } catch {
    return null
  }
}

async function fetchMinuteAggs(
  apiKey: string,
  symbol: string,
): Promise<Array<{ t: number; c: number; o: number }> | null> {
  try {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const from = ymd(yesterday)
    const to = ymd(now)
    const url =
      `${POLYGON_BASE}/v2/aggs/ticker/${symbol}/range/1/minute/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[hourly-scoreboard] minute ${symbol}: ${res.status}`)
      return null
    }
    const data = await res.json()
    if (!data.results?.length) return null
    return data.results as Array<{ t: number; c: number; o: number }>
  } catch (err) {
    console.warn(`[hourly-scoreboard] minute ${symbol} error:`, err)
    return null
  }
}

async function fetchRiskSymbol(
  apiKey: string,
  sym: { symbol: string; label: string },
): Promise<{ line: RiskLine | null; usedMinute: boolean; error?: string }> {
  const asOf = new Date().toISOString()
  const windowStart = Date.now() - 60 * 60 * 1000

  const bars = await fetchMinuteAggs(apiKey, sym.symbol)
  if (bars && bars.length > 0) {
    const inWindow = bars.filter((b) => b.t >= windowStart)
    const windowBars = inWindow.length >= 2 ? inWindow : bars.slice(-Math.min(bars.length, 60))
    if (windowBars.length >= 2) {
      const first = windowBars[0]
      const last = windowBars[windowBars.length - 1]
      const change1hPct =
        first.c > 0 ? round2(((last.c - first.c) / first.c) * 100) : null

      // Session: first bar of today (UTC date) open \u2192 last close; else prev
      const today = ymd(new Date())
      const todayBars = bars.filter((b) => ymd(new Date(b.t)) === today)
      let changeSessionPct: number | null = null
      if (todayBars.length >= 1) {
        const dayOpen = todayBars[0].o
        const dayClose = todayBars[todayBars.length - 1].c
        changeSessionPct =
          dayOpen > 0 ? round2(((dayClose - dayOpen) / dayOpen) * 100) : null
      } else {
        const prev = await fetchPrev(apiKey, sym.symbol)
        changeSessionPct = prev?.changeSessionPct ?? null
      }

      return {
        line: {
          symbol: sym.symbol,
          label: sym.label,
          price: last.c,
          change1hPct,
          changeSessionPct,
          asOf,
        },
        usedMinute: true,
      }
    }
  }

  // Fallback: prev day/session aggs
  const prev = await fetchPrev(apiKey, sym.symbol)
  if (!prev) {
    return {
      line: null,
      usedMinute: false,
      error: `${sym.symbol}: no minute aggs or prev`,
    }
  }
  return {
    line: {
      symbol: sym.symbol,
      label: sym.label,
      price: prev.price,
      change1hPct: null,
      changeSessionPct: prev.changeSessionPct,
      asOf,
    },
    usedMinute: false,
  }
}

PLACEHOLDER_PART2
