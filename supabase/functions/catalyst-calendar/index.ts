// Supabase Edge Function: catalyst-calendar (Catalyst & Calendar agent)
// Runtime: Deno
//
// Builds a forward calendar of catalysts for the user's holdings + watchlist:
//   - Ex-dividend and dividend pay dates (from Polygon, via dividend-history)
//   - Earnings dates -- ONLY if an FMP_API_KEY secret is configured. Polygon's
//     free tier has no upcoming-earnings feed, so earnings are an opt-in add-on.
//     Absent the key we return dividend catalysts only and earningsAvailable:false
//     (never fabricated dates).
// Then asks Claude Haiku for a one-line "week ahead" read (best effort).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          ANTHROPIC_API_KEY (optional), FMP_API_KEY (optional, enables earnings)
//
// POST /functions/v1/catalyst-calendar
// Body: { horizonDays?: number, anonymousContext?: { watchlist?, transactions? } }
// Response: { events, earningsAvailable, note, profileSymbols, generatedAt }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_HORIZON_DAYS = 75
const MAX_SYMBOLS = 25
const MAX_EVENTS = 50

interface CalendarEvent {
  date: string          // YYYY-MM-DD
  symbol: string
  name: string
  type: 'ex_dividend' | 'pay_date' | 'earnings'
  label: string
  detail: string | null
}

// Net-held symbols (shares > 0) + display names.
function gatherFromTransactions(transactions: any[]): Map<string, string> {
  const net = new Map<string, { shares: number; name: string }>()
  for (const t of transactions || []) {
    const symbol = String(t.symbol || '').toUpperCase()
    if (!symbol) continue
    const e = net.get(symbol) || { shares: 0, name: '' }
    if (!e.name && t.name) e.name = String(t.name)
    const n = Number(t.shares) || 0
    if (t.transaction_type === 'buy') e.shares += n
    else if (t.transaction_type === 'sell') e.shares -= n
    net.set(symbol, e)
  }
  const out = new Map<string, string>()
  for (const [sym, v] of net) if (v.shares > 1e-8) out.set(sym, v.name)
  return out
}

async function callInternalFunction(fnName: string, body: any): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// --- Earnings via Financial Modeling Prep (optional) ---
async function fetchEarnings(
  fmpKey: string,
  symbols: Set<string>,
  fromStr: string,
  toStr: string,
): Promise<CalendarEvent[]> {
  try {
    const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromStr}&to=${toStr}&apikey=${fmpKey}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    const out: CalendarEvent[] = []
    for (const row of data) {
      const sym = String(row?.symbol || '').toUpperCase()
      if (!symbols.has(sym)) continue
      const date = String(row?.date || '').slice(0, 10)
      if (!date) continue
      const when = row?.time ? ` (${row.time})` : ''
      const est = row?.epsEstimated != null ? `est EPS ${row.epsEstimated}` : null
      out.push({
        date, symbol: sym, name: '',
        type: 'earnings', label: 'Earnings',
        detail: `Earnings${when}${est ? ` -- ${est}` : ''}`,
      })
    }
    return out
  } catch {
    return []
  }
}

async function generateNote(
  anthropicKey: string,
  events: CalendarEvent[],
): Promise<string | null> {
  try {
    const lines = events.slice(0, 20).map((e) => `${e.date} ${e.symbol} ${e.label}${e.detail ? ` (${e.detail})` : ''}`)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: 'You brief a portfolio manager on upcoming catalysts. One or two tight sentences, specific, no preamble, no disclaimers.',
        messages: [{
          role: 'user',
          content: `Here are the next upcoming catalysts for this investor's holdings/watchlist:\n${lines.join('\n')}\n\nWrite a 1-2 sentence "week(s) ahead" note: what's most worth watching and why. Name tickers. If it's quiet, say so.`,
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    return text || null
  } catch {
    return null
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let body: { horizonDays?: number; anonymousContext?: any }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const horizon = Math.min(Math.max(Number(body.horizonDays) || DEFAULT_HORIZON_DAYS, 7), 180)

  // Resolve user (permissive).
  let userId: string | null = null
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(token)
      if (data?.user) userId = data.user.id
    } catch (_) { /* anonymous */ }
  }

  try {
    // Build symbol -> name map from holdings + watchlist.
    const names = new Map<string, string>()
    if (userId) {
      const [{ data: txns }, { data: wl }] = await Promise.all([
        supabaseAdmin.from('transactions').select('symbol, name, transaction_type, shares').eq('user_id', userId),
        supabaseAdmin.from('watchlist').select('symbol, name').eq('user_id', userId).limit(40),
      ])
      for (const [sym, nm] of gatherFromTransactions(txns || [])) names.set(sym, nm)
      for (const w of wl || []) {
        const sym = String(w.symbol || '').toUpperCase()
        if (sym && !names.has(sym)) names.set(sym, w.name || '')
      }
    } else {
      const ctx = body.anonymousContext || {}
      for (const [sym, nm] of gatherFromTransactions(ctx.transactions || [])) names.set(sym, nm)
      for (const w of ctx.watchlist || []) {
        const sym = String(w.symbol || '').toUpperCase()
        if (sym && !names.has(sym)) names.set(sym, w.name || '')
      }
    }

    const symbols = [...names.keys()].slice(0, MAX_SYMBOLS)
    if (symbols.length === 0) {
      return new Response(JSON.stringify({
        events: [], earningsAvailable: Boolean(Deno.env.get('FMP_API_KEY')),
        note: null, profileSymbols: [], generatedAt: new Date().toISOString(),
      }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    const today = new Date().toISOString().slice(0, 10)
    const horizonDate = new Date(Date.now() + horizon * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const inWindow = (d: string | null) => Boolean(d) && d! >= today && d! <= horizonDate

    const events: CalendarEvent[] = []

    // Dividend catalysts (ex-date + pay-date) from Polygon via dividend-history.
    const divResult = await callInternalFunction('dividend-history', { symbols })
    const dividends = divResult?.dividends || {}
    for (const sym of symbols) {
      const summary = dividends[sym]
      if (!summary?.events) continue
      for (const ev of summary.events) {
        const amt = ev.cashAmount != null ? `$${Number(ev.cashAmount).toFixed(2)}/sh` : null
        if (inWindow(ev.exDate)) {
          events.push({
            date: ev.exDate, symbol: sym, name: names.get(sym) || '',
            type: 'ex_dividend', label: 'Ex-Dividend',
            detail: amt ? `${amt}${summary.frequencyLabel ? ` · ${summary.frequencyLabel}` : ''}` : null,
          })
        }
        if (inWindow(ev.payDate)) {
          events.push({
            date: ev.payDate, symbol: sym, name: names.get(sym) || '',
            type: 'pay_date', label: 'Dividend Pay',
            detail: amt,
          })
        }
      }
    }

    // Earnings (optional, requires FMP_API_KEY).
    const fmpKey = Deno.env.get('FMP_API_KEY')
    const earningsAvailable = Boolean(fmpKey)
    if (fmpKey) {
      const earnings = await fetchEarnings(fmpKey, new Set(symbols), today, horizonDate)
      for (const e of earnings) {
        e.name = names.get(e.symbol) || ''
        events.push(e)
      }
    }

    // Dedupe (same symbol+date+type) and sort ascending by date.
    const seen = new Set<string>()
    const deduped = events.filter((e) => {
      const k = `${e.symbol}|${e.date}|${e.type}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    deduped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)))
    const trimmed = deduped.slice(0, MAX_EVENTS)

    // Best-effort "week ahead" note.
    let note: string | null = null
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (anthropicKey && trimmed.length > 0) {
      note = await generateNote(anthropicKey, trimmed)
    }

    return new Response(JSON.stringify({
      events: trimmed,
      earningsAvailable,
      note,
      profileSymbols: symbols,
      horizonDays: horizon,
      generatedAt: new Date().toISOString(),
    }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[catalyst-calendar] failed:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
