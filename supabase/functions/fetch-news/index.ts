// Supabase Edge Function: fetch-news
// Runtime: Deno
//
// Proxies newsdata.io API calls server-side so the API key
// never reaches the browser. The frontend calls this function
// with a category (local/national/business) and gets back
// normalized articles.
//
// Secrets required (set via supabase secrets set):
//   NEWSDATA_KEY  -- your newsdata.io API key
//
// POST /functions/v1/fetch-news
// Body: { category: "local" | "national" | "business" | "all", state?: string }
// Response: { articles: Article[], category: string }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const NEWSDATA_BASE = 'https://newsdata.io/api/1'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Words that look like tickers but aren't
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

function normalizeArticle(raw: Record<string, unknown>, category: string) {
  const id = (raw.article_id as string) || `${raw.link || ''}__${raw.pubDate || ''}`
  return {
    id,
    title: ((raw.title as string) || '').trim(),
    description: (raw.description as string)?.trim() || null,
    url: (raw.link as string) || null,
    source: (raw.source_name as string) || (raw.source_id as string) || 'Unknown source',
    publishedAt: (raw.pubDate as string) || null,
    imageUrl: (raw.image_url as string) || null,
    category,
    tickers: extractTickers(raw.ai_tag),
    sentiment: (raw.sentiment as string) || null,
  }
}

function dedupe(articles: Array<Record<string, unknown>>) {
  const seen = new Set<string>()
  const out: Array<Record<string, unknown>> = []
  for (const article of articles) {
    const key = ((article.title as string) || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(article)
  }
  return out
}

async function fetchFromNewsdata(
  apiKey: string,
  endpoint: string,
  params: Record<string, string>,
  category: string,
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
  return data.results.map((raw: Record<string, unknown>) => normalizeArticle(raw, category))
}

async function fetchLocal(apiKey: string, state: string) {
  return await fetchFromNewsdata(apiKey, 'latest', {
    q: state,
    country: 'us',
    category: 'politics,business',
    language: 'en',
    size: '10',
  }, 'local')
}

async function fetchNational(apiKey: string) {
  return await fetchFromNewsdata(apiKey, 'latest', {
    country: 'us',
    category: 'politics,top',
    language: 'en',
    size: '10',
  }, 'national')
}

async function fetchBusiness(apiKey: string) {
  return await fetchFromNewsdata(apiKey, 'market', {
    language: 'en',
    size: '10',
  }, 'business')
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

  const apiKey = Deno.env.get('NEWSDATA_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'NEWSDATA_KEY not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  let body: { category?: string; state?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const category = body.category || 'all'
  const state = body.state || 'Arizona'

  try {
    let articles: Array<Record<string, unknown>>

    if (category === 'all') {
      const [local, national, business] = await Promise.all([
        fetchLocal(apiKey, state),
        fetchNational(apiKey),
        fetchBusiness(apiKey),
      ])
      // Business first so the combined feed leads with market content
      articles = dedupe([...business, ...national, ...local])
      // Also return the individual categories for tab filtering
      return new Response(
        JSON.stringify({
          all: articles,
          local: dedupe(local),
          national: dedupe(national),
          business: dedupe(business),
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    } else if (category === 'local') {
      articles = dedupe(await fetchLocal(apiKey, state))
    } else if (category === 'national') {
      articles = dedupe(await fetchNational(apiKey))
    } else if (category === 'business') {
      articles = dedupe(await fetchBusiness(apiKey))
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown category: ${category}` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ articles, category }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[fetch-news] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error fetching news',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})