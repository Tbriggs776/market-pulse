// FRED rates + Polygon risk fetchers
import {
  FRED_BASE,
  POLYGON_BASE,
  round2,
  ymd,
  type RiskLine,
} from './constants.ts'

export async function fetchFredRate(
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
      // Yields already in %; difference * 100 → basis points
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

export async function fetchRiskSymbol(
  apiKey: string,
  sym: { symbol: string; label: string },
): Promise<{ line: RiskLine | null; usedMinute: boolean; error?: string }> {
  const asOf = new Date().toISOString()
  const windowStart = Date.now() - 60 * 60 * 1000

  const bars = await fetchMinuteAggs(apiKey, sym.symbol)
  if (bars && bars.length > 0) {
    const inWindow = bars.filter((b) => b.t >= windowStart)
    const windowBars =
      inWindow.length >= 2 ? inWindow : bars.slice(-Math.min(bars.length, 60))
    if (windowBars.length >= 2) {
      const first = windowBars[0]
      const last = windowBars[windowBars.length - 1]
      const change1hPct =
        first.c > 0 ? round2(((last.c - first.c) / first.c) * 100) : null

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
