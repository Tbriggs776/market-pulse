// Supabase Edge Function: curate-news (Portfolio-Aware News Curator agent)
// Runtime: Deno
//
// Layers a relevance pass on top of fetch-news. Where fetch-news narrows by
// source/topic, this narrows by relevance to the user's ACTUAL portfolio:
//   1. Resolve the user (auth token -> DB, or anonymousContext from the body)
//   2. Build a profile: held tickers + company names, watchlist, rule sectors
//   3. Pull the narrowed feed from fetch-news
//   4. Ask Claude Haiku to score each article 0-1 for relevance to the profile
//      and tag which holdings it touches
//   5. Return the feed annotated + reordered, plus a "forYou" lens
//
// Degrades gracefully: no profile, or any Claude failure -> returns the base
// feed unchanged with curated:false. A broken curation pass must never blank
// the dashboard.
//
// Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// POST /functions/v1/curate-news
// Body: { state?: string, anonymousContext?: { watchlist?, transactions? } }
// Response: { all, local, national, business, forYou, curated, profileTickers }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const MODEL = 'claude-haiku-4-5-20251001'
const FORYOU_THRESHOLD = 0.45  // min relevance to surface in the "For You" lens
const MAX_ARTICLES = 36        // cap sent to the model (3 categories x ~10 + slack)

interface Article {
  id: string
  title: string
  description: string | null
  category: string
  source: string
  [k: string]: unknown
}

interface Profile {
  tickers: string[]      // held + watchlist symbols
  names: string[]        // company names for fuzzy matching
  sectors: string[]      // sectors of interest (from holdings/rules)
  exclusions: string     // free-text things to avoid
}

// --- Net-position resolver (lightweight; we only need which symbols are held) ---
// Mirrors the spirit of positionEngine without lot-level detail: a symbol is
// "held" if cumulative buy shares exceed sell shares.
function heldSymbols(transactions: any[]): { symbol: string; name: string }[] {
  const net = new Map<string, { shares: number; name: string }>()
  for (const t of transactions || []) {
    const symbol = String(t.symbol || '').toUpperCase()
    if (!symbol) continue
    const entry = net.get(symbol) || { shares: 0, name: '' }
    if (!entry.name && t.name) entry.name = String(t.name)
    const shares = Number(t.shares) || 0
    if (t.transaction_type === 'buy') entry.shares += shares
    else if (t.transaction_type === 'sell') entry.shares -= shares
    net.set(symbol, entry)
  }
  const out: { symbol: string; name: string }[] = []
  for (const [symbol, v] of net) {
    if (v.shares > 1e-8) out.push({ symbol, name: v.name })
  }
  return out
}

async function buildAuthedProfile(supabaseAdmin: any, userId: string): Promise<Profile> {
  const tickers = new Set<string>()
  const names = new Set<string>()
  const sectors = new Set<string>()
  let exclusions = ''

  // Held positions from transactions
  try {
    const { data: txns } = await supabaseAdmin
      .from('transactions')
      .select('symbol, name, asset_type, transaction_type, shares')
      .eq('user_id', userId)
    for (const h of heldSymbols(txns || [])) {
      tickers.add(h.symbol)
      if (h.name) names.add(h.name)
    }
  } catch (_) { /* silent */ }

  // Watchlist
  try {
    const { data: wl } = await supabaseAdmin
      .from('watchlist')
      .select('symbol, name')
      .eq('user_id', userId)
      .limit(40)
    for (const w of wl || []) {
      if (w.symbol) tickers.add(String(w.symbol).toUpperCase())
      if (w.name) names.add(String(w.name))
    }
  } catch (_) { /* silent */ }

  // Sector hints from owned-position metadata (best effort)
  try {
    const symbols = [...tickers]
    if (symbols.length > 0) {
      const meta = await callInternalFunction('asset-metadata', { symbols })
      const m = meta?.metadata || {}
      for (const s of symbols) {
        if (m[s]?.sector) sectors.add(String(m[s].sector))
      }
    }
  } catch (_) { /* silent */ }

  // Investment rules: exclusions are policy
  try {
    const { data: rules } = await supabaseAdmin
      .from('investment_rules')
      .select('exclusions, onboarding_status')
      .eq('user_id', userId)
      .maybeSingle()
    if (rules?.onboarding_status === 'completed' && rules.exclusions) {
      exclusions = String(rules.exclusions).slice(0, 400)
    }
  } catch (_) { /* silent */ }

  return {
    tickers: [...tickers],
    names: [...names].slice(0, 40),
    sectors: [...sectors],
    exclusions,
  }
}

function buildAnonProfile(ctx: { watchlist?: any[]; transactions?: any[] } | null): Profile {
  const tickers = new Set<string>()
  const names = new Set<string>()
  if (ctx?.watchlist) {
    for (const w of ctx.watchlist) {
      if (w.symbol) tickers.add(String(w.symbol).toUpperCase())
      if (w.name) names.add(String(w.name))
    }
  }
  for (const h of heldSymbols(ctx?.transactions || [])) {
    tickers.add(h.symbol)
    if (h.name) names.add(h.name)
  }
  return { tickers: [...tickers], names: [...names].slice(0, 40), sectors: [], exclusions: '' }
}

async function callInternalFunction(fnName: string, body: any): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) return { error: `${fnName} returned ${res.status}` }
  try { return JSON.parse(text) } catch { return { error: `${fnName} returned non-JSON` } }
}

// --- Claude relevance pass ---
// Returns a map: article index -> { score, tickers, reason }
async function scoreArticles(
  profile: Profile,
  articles: Article[],
): Promise<Record<number, { score: number; tickers: string[]; reason: string }>> {
  if (!ANTHROPIC_KEY) return {}

  const profileBlock = [
    `Holdings & watchlist tickers: ${profile.tickers.join(', ') || '(none)'}`,
    `Company names: ${profile.names.join(', ') || '(none)'}`,
    profile.sectors.length ? `Sectors held: ${profile.sectors.join(', ')}` : '',
    profile.exclusions ? `Avoids: ${profile.exclusions}` : '',
  ].filter(Boolean).join('\n')

  const articleBlock = articles
    .map((a, i) =>
      `[${i}] (${a.category}) ${a.title}${a.description ? ` -- ${String(a.description).slice(0, 200)}` : ''}`,
    )
    .join('\n')

  const system =
    'You score news articles for relevance to a specific investor\'s portfolio. ' +
    'You return ONLY a JSON array, no prose. Be strict: generic market noise scores low; ' +
    'articles that touch the investor\'s actual tickers, their companies, their sectors, ' +
    'or macro forces that move their book (rates, the Fed, energy prices, regulation of a ' +
    'held sector) score high.'

  const prompt = `INVESTOR PROFILE:
${profileBlock}

ARTICLES:
${articleBlock}

For each article, output an object: {"i": <index>, "score": <0..1>, "tickers": [<which of the investor's tickers it relates to, [] if none>], "reason": "<8 words max>"}.
Scoring guide:
- 0.8-1.0: directly about a held/watchlist ticker or its company
- 0.5-0.7: the investor's sector, or a macro force clearly moving their holdings
- 0.2-0.4: general market/business relevance, no specific tie
- 0.0-0.1: off-topic for this investor (local color, unrelated politics)
Output ONLY the JSON array of all ${articles.length} objects.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}`)
  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < 0) throw new Error('No JSON array in model output')
  const parsed = JSON.parse(text.slice(start, end + 1))

  const map: Record<number, { score: number; tickers: string[]; reason: string }> = {}
  const validTickers = new Set(profile.tickers)
  for (const row of parsed) {
    const i = Number(row?.i)
    if (!Number.isInteger(i) || i < 0 || i >= articles.length) continue
    let score = Number(row?.score)
    if (!Number.isFinite(score)) score = 0
    score = Math.max(0, Math.min(1, score))
    const tickers = Array.isArray(row?.tickers)
      ? row.tickers.map((t: any) => String(t).toUpperCase()).filter((t: string) => validTickers.has(t)).slice(0, 5)
      : []
    map[i] = { score, tickers, reason: String(row?.reason || '').slice(0, 80) }
  }
  return map
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let body: { state?: string; anonymousContext?: any }
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const state = body.state || 'Arizona'

  // Resolve user (permissive: invalid token -> anonymous)
  let userId: string | null = null
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(token)
      if (data?.user) userId = data.user.id
    } catch (_) { /* anonymous */ }
  }

  // Always have the base feed ready -- this is the fallback for every error path.
  const base = await callInternalFunction('fetch-news', { category: 'all', state })
  const baseResponse = {
    all: base.all || [],
    local: base.local || [],
    national: base.national || [],
    business: base.business || [],
    forYou: [],
    curated: false,
    profileTickers: [] as string[],
  }

  try {
    const profile = userId
      ? await buildAuthedProfile(supabaseAdmin, userId)
      : buildAnonProfile(body.anonymousContext || null)

    // No tickers to anchor on -> nothing to curate against. Return base feed.
    if (profile.tickers.length === 0) {
      return new Response(JSON.stringify(baseResponse), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Score the unique "all" set (categories overlap minimally; "all" is the union).
    const articles = (baseResponse.all as Article[]).slice(0, MAX_ARTICLES)
    if (articles.length === 0) {
      return new Response(JSON.stringify({ ...baseResponse, profileTickers: profile.tickers }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const scores = await scoreArticles(profile, articles)
    const byId = new Map<string, { score: number; tickers: string[]; reason: string }>()
    articles.forEach((a, i) => { if (scores[i]) byId.set(a.id, scores[i]) })

    // Annotate each category array from the shared score map (by article id).
    const annotateList = (list: Article[]) =>
      list.map((a) => {
        const s = byId.get(a.id)
        return {
          ...a,
          relevance: s ? s.score : null,
          matchedTickers: s ? s.tickers : [],
          curationReason: s ? s.reason : null,
        }
      })

    const allAnnotated = annotateList(baseResponse.all as Article[])
    const byRelevance = (x: any, y: any) => (y.relevance ?? -1) - (x.relevance ?? -1)

    const forYou = allAnnotated
      .filter((a) => (a.relevance ?? 0) >= FORYOU_THRESHOLD)
      .sort(byRelevance)

    return new Response(JSON.stringify({
      all: [...allAnnotated].sort(byRelevance),
      local: annotateList(baseResponse.local as Article[]).sort(byRelevance),
      national: annotateList(baseResponse.national as Article[]).sort(byRelevance),
      business: annotateList(baseResponse.business as Article[]).sort(byRelevance),
      forYou,
      curated: true,
      profileTickers: profile.tickers,
    }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  } catch (err) {
    // Any failure -> serve the base feed. Curation is an enhancement, not a gate.
    console.warn('[curate-news] falling back to base feed:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify(baseResponse), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
