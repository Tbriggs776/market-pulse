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
import {
  CORS_HEADERS,
  FRED_SERIES,
  RISK_SYMBOLS,
  type RiskLine,
  type GeoItem,
} from './constants.ts'
import { fetchFredRate, fetchRiskSymbol } from './fred_risk.ts'
import {
  fetchGeopoliticsFromDb,
  fetchGeopoliticsFromNewsdata,
} from './geo.ts'

function moveAbs(line: RiskLine | undefined): number {
  if (!line) return 0
  const v = line.change1hPct ?? line.changeSessionPct ?? 0
  return Math.abs(v)
}

function computeRegime(
  silent: boolean,
  risk: RiskLine[],
): 'quiet' | 'mixed' | 'risk-on' | 'risk-off' {
  if (silent) return 'quiet'

  const bySym = Object.fromEntries(risk.map((r) => [r.symbol, r]))
  const signed = (line: RiskLine | undefined): number => {
    if (!line) return 0
    return line.change1hPct ?? line.changeSessionPct ?? 0
  }

  const spyM = signed(bySym['SPY'])
  const qqqM = signed(bySym['QQQ'])
  const hygM = signed(bySym['HYG'])
  const vixyM = signed(bySym['VIXY'])

  const upMeaningful = (m: number) => m >= 0.35
  const downMeaningful = (m: number) => m <= -0.35

  if (upMeaningful(spyM) && upMeaningful(qqqM) && hygM > 0) return 'risk-on'
  if (
    (downMeaningful(spyM) && downMeaningful(qqqM)) ||
    hygM < -0.2 ||
    vixyM > 0.5
  ) {
    return 'risk-off'
  }
  return 'mixed'
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
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const newsdataKey = Deno.env.get('NEWSDATA_KEY')

  if (!fredKey && !polygonKey) {
    return new Response(
      JSON.stringify({
        error: 'FRED_API_KEY and MASSIVE_API_KEY not configured',
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  const errors: string[] = []
  let riskSource: 'minute-aggs' | 'session-fallback' = 'minute-aggs'
  let metaNote: string | undefined

  try {
    const ratesPromise = fredKey
      ? Promise.all(
          FRED_SERIES.map(async (s) => {
            const row = await fetchFredRate(fredKey, s)
            if (!row) errors.push(`FRED ${s.id} unavailable`)
            return row
          }),
        )
      : (errors.push('FRED_API_KEY missing'), Promise.resolve([]))

    const riskPromise = polygonKey
      ? Promise.all(
          RISK_SYMBOLS.map(async (s) => {
            const result = await fetchRiskSymbol(polygonKey, s)
            if (result.error) errors.push(result.error)
            return result
          }),
        )
      : (errors.push('MASSIVE_API_KEY missing'), Promise.resolve([]))

    const geoPromise = (async (): Promise<GeoItem[]> => {
      if (supabaseUrl && serviceKey) {
        try {
          return await fetchGeopoliticsFromDb(supabaseUrl, serviceKey)
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : 'news_articles failed',
          )
        }
      }
      if (newsdataKey) {
        try {
          return await fetchGeopoliticsFromNewsdata(newsdataKey)
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : 'newsdata failed',
          )
        }
      }
      return []
    })()

    const [rateRows, riskResults, geopolitics] = await Promise.all([
      ratesPromise,
      riskPromise,
      geoPromise,
    ])

    const rates = rateRows.filter(
      Boolean,
    ) as NonNullable<(typeof rateRows)[0]>[]
    const risk: RiskLine[] = []
    let anyMinute = false
    let anySessionOnly = false
    for (const r of riskResults) {
      if (r.line) {
        risk.push(r.line)
        if (r.usedMinute) anyMinute = true
        else anySessionOnly = true
      }
    }

    if (anyMinute && !anySessionOnly) {
      riskSource = 'minute-aggs'
    } else if (anySessionOnly && !anyMinute) {
      riskSource = 'session-fallback'
      metaNote =
        'Moves are session (prev close)—not 1h; free-tier minute aggs unavailable'
    } else if (anyMinute && anySessionOnly) {
      riskSource = 'minute-aggs'
      metaNote = 'Some symbols used session fallback (minute aggs empty)'
    } else {
      riskSource = 'session-fallback'
    }

    const bySym = Object.fromEntries(risk.map((r) => [r.symbol, r]))
    const spyMove = moveAbs(bySym['SPY'])
    const qqqMove = moveAbs(bySym['QQQ'])
    const dgs10 = rates.find((r) => r.id === 'DGS10')
    const ratesQuiet =
      dgs10?.changeBp == null || Math.abs(dgs10.changeBp) < 3
    const geoQuiet = geopolitics.length === 0
    const silent =
      spyMove < 0.35 && qqqMove < 0.45 && ratesQuiet && geoQuiet

    const regime = computeRegime(silent, risk)

    const meta: Record<string, unknown> = { errors, riskSource }
    if (metaNote) meta.note = metaNote

    return new Response(
      JSON.stringify({
        asOf: new Date().toISOString(),
        regime,
        rates,
        risk,
        geopolitics,
        silent,
        meta,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[hourly-scoreboard] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }
})
