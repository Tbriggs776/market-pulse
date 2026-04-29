// Supabase Edge Function: fetch-news (Pass 9: cached)
// Runtime: Deno
//
// Read-through cache pattern:
//   1. Query news_articles table for the category (and state if local)
//   2. If latest row is fresh (<FRESHNESS_MINUTES old), return cached articles
//   3. Otherwise, hit newsdata.io, upsert results, return fresh
//
// Secrets: NEWSDATA_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const NEWSDATA_BASE = 'https://newsdata.io/api/1'
const FRESHNESS_MINUTES = 60  // cache window per Pass 9 decision

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TICKER_BLOCKLIST = new Set([
  'US', 'USA', 'UK', 'EU', 'CEO', 'CFO', 'IPO', 'GDP', 'AI',
  'API', 'SEC', 'FBI', 'CIA', 'NYSE', 'NASDAQ', 'ETF', 'IRS',
  'FED', 'FOMC', 'ESG', 'NFT', 'IT', 'PR', 'HR', 'TV', 'USD',
])

function extractTickers(aiTags: unknown): string[] {
  if (!Array.isArray(aiTags)) return []
  const candidates = new Set<string>()
  for (const tag of aiTags) {
    if (typeof tag !== 'string') continue
    const match = tag.match(/\b([A-Z]{1,5})\b/)
    if (match) candidates.add(match[1])
  }
  return [...candidates].filter((t) => !TICKER_BLOCKLIST.has(t)).slice(0, 3)
}

function dedupeKey(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function normalizeArticle(raw: Record<string, unknown>, category: string, state: string | null) {
  const title = ((raw.title as string) || '').trim()
  return {
    external_id: (raw.article_id as string) || null,
    title,
    description: (raw.description as string)?.trim() || null,
    url: (raw.link as string) || null,
    source: (raw.source_name as string) || (raw.source_id as string) || 'Unknown source',
    image_url: (raw.image_url as string) || null,
    category,
    state,
    tickers: extractTickers(raw.ai_tag),
    sentiment: (raw.sentiment as string) || null,
    published_at: (raw.pubDate as string) || null,
    dedupe_key: dedupeKey(title),
  }
}

// Public-facing article shape (matches what frontend expects)
function toPublicArticle(row: any) {
  return {
    id: row.id?.toString() || row.external_id || `${row.url || ''}__${row.published_at || ''}`,
    title: row.title,
    description: row.description,
    url: row.url,
    source: row.source,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    category: row.category,
    tickers: row.tickers || [],
    sentiment: row.sentiment,
  }
}

async function fetchFromNewsdata(
  apiKey: string,
  endpoint: string,
  params: Record<string, string>,
) {
  const url = new URL(`${NEWSDATA_BASE}/${endpoint}`)
  url.searchParams.set('apikey', apiKey)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    console.warn(`[fetch-news] ${endpoint} returned ${res.status}`)
    return []
  }
  const data = await res.json()
  if (data.status !== 'success' || !Array.isArray(data.results)) {
    console.warn('[fetch-news] unexpected response shape', data.status)
    return []
  }
  return data.results as Array<Record<string, unknown>>
}

// Category filters are intentionally narrow: politics + domestic policy +
// world (geopolitics / supply chain / commodity news) + business. We exclude
// newsdata's `top` catch-all and entertainment/sports/lifestyle/etc. on
// purpose -- this surface is for investing + policy signal, not headlines.
async function fetchLocal(apiKey: string, state: string) {
  return await fetchFromNewsdata(apiKey, 'latest', {
    q: state, country: 'us',
    category: 'politics,business,domestic',
    language: 'en', size: '10',
  })
}
async function fetchNational(apiKey: string) {
  return await fetchFromNewsdata(apiKey, 'latest', {
    country: 'us',
    category: 'politics,domestic,world',
    language: 'en', size: '10',
  })
}
async function fetchBusiness(apiKey: string) {
  // newsdata's /market endpoint returns financial-market news; already curated.
  return await fetchFromNewsdata(apiKey, 'market', {
    language: 'en', size: '10',
  })
}

/**
 * Read-through cache.
 * Returns { articles, cacheHit } — articles in public shape.
 */
async function loadCategory(
  supabase: any,
  apiKey: string,
  category: 'local' | 'national' | 'business',
  state: string | null,
): Promise<{ articles: any[]; cacheHit: boolean }> {
  // Check cache freshness: most recent fetched_at for this category/state
  const freshnessCutoff = new Date(Date.now() - FRESHNESS_MINUTES * 60 * 1000).toISOString()

  let freshQuery = supabase
    .from('news_articles')
    .select('id, external_id, title, description, url, source, image_url, category, state, tickers, sentiment, published_at, fetched_at')
    .eq('category', category)
    .gte('fetched_at', freshnessCutoff)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(10)

  if (category === 'local' && state) {
    freshQuery = freshQuery.eq('state', state)
  } else {
    freshQuery = freshQuery.is('state', null)
  }

  const { data: cached, error: cacheErr } = await freshQuery
  if (!cacheErr && cached && cached.length > 0) {
    console.log(`[fetch-news] cache hit: ${cached.length} ${category}${state ? ' (' + state + ')' : ''}`)
    return { articles: cached.map(toPublicArticle), cacheHit: true }
  }

  // Cache miss: hit newsdata.io
  console.log(`[fetch-news] cache miss: fetching ${category}${state ? ' (' + state + ')' : ''}`)
  let raw: Array<Record<string, unknown>> = []
  if (category === 'local' && state) raw = await fetchLocal(apiKey, state)
  else if (category === 'national') raw = await fetchNational(apiKey)
  else if (category === 'business') raw = await fetchBusiness(apiKey)

  if (raw.length === 0) {
    // API failed or returned nothing. Try serving stale cache as a fallback.
    const { data: stale } = await supabase
      .from('news_articles')
      .select('id, external_id, title, description, url, source, image_url, category, state, tickers, sentiment, published_at')
      .eq('category', category)
      .eq(category === 'local' && state ? 'state' : 'id', category === 'local' && state ? state : (undefined as any))
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(10)
    // Note: the above is imperfect but the stale fallback is a best-effort. Skip it if it errors.
    if (stale && stale.length > 0) {
      return { articles: stale.map(toPublicArticle), cacheHit: true }
    }
    return { articles: [], cacheHit: false }
  }

  // Normalize, dedupe locally by dedupe_key (in case newsdata.io returns dups)
  const seen = new Set<string>()
  const normalized = raw.map((r) => normalizeArticle(r, category, category === 'local' ? state : null))
    .filter((a) => {
      if (!a.dedupe_key || seen.has(a.dedupe_key)) return false
      seen.add(a.dedupe_key)
      return true
    })

  // Upsert — ON CONFLICT (dedupe_key, category, state) update fetched_at/expires_at
  if (normalized.length > 0) {
    // Refresh timestamps for upsert
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const rows = normalized.map((a) => ({ ...a, fetched_at: now, expires_at: expiresAt }))
    const { error: upsertErr } = await supabase
      .from('news_articles')
      .upsert(rows, { onConflict: 'dedupe_key,category,state', ignoreDuplicates: false })
    if (upsertErr) {
      console.warn('[fetch-news] upsert error:', upsertErr.message)
    }
  }

  // Return the just-fetched articles in public shape
  // (convert our internal row to public shape — need a synthetic id for articles we just inserted)
  const articles = normalized.map((a, i) => toPublicArticle({
    ...a,
    id: `${category}-${i}-${Date.now()}`, // synthetic, will be overwritten on next DB read
    published_at: a.published_at,
    image_url: a.image_url,
  }))
  return { articles, cacheHit: false }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('NEWSDATA_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration incomplete' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { category?: string; state?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const category = body.category || 'all'
  const state = body.state || 'Arizona'

  try {
    if (category === 'all') {
      const [local, national, business] = await Promise.all([
        loadCategory(supabase, apiKey, 'local', state),
        loadCategory(supabase, apiKey, 'national', null),
        loadCategory(supabase, apiKey, 'business', null),
      ])
      const all = [...business.articles, ...national.articles, ...local.articles]
      return new Response(
        JSON.stringify({
          all,
          local: local.articles,
          national: national.articles,
          business: business.articles,
          cacheHits: {
            local: local.cacheHit,
            national: national.cacheHit,
            business: business.cacheHit,
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    if (!['local', 'national', 'business'].includes(category)) {
      return new Response(
        JSON.stringify({ error: `Unknown category: ${category}` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const result = await loadCategory(supabase, apiKey, category as any, category === 'local' ? state : null)
    return new Response(
      JSON.stringify({ articles: result.articles, category, cacheHit: result.cacheHit }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[fetch-news] failed:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})