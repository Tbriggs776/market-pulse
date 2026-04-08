/**
 * News Service — newsdata.io wrapper
 * ────────────────────────────────────────────────────────────
 * Free-tier notes (as of setup):
 *   • 200 credits/day, 10 articles/credit = ~2,000 articles/day
 *   • 30 credits per 15 min (we won't hit this)
 *   • 12-hour article delay (fine for a morning briefing)
 *   • No CORS restrictions, works from localhost AND production
 *   • Commercial use allowed on free tier
 *
 * Two endpoints we use:
 *   /api/1/latest    — general news, filterable by country/category/q
 *   /api/1/market    — dedicated financial/market news endpoint
 *
 * Returned article shape (canonical, normalized away from
 * newsdata.io's raw response). Downstream components never see
 * the raw API response — if we swap providers later, this file
 * changes and nothing else does.
 *
 *   Article = {
 *     id:          string  (stable, derived from article_id)
 *     title:       string
 *     description: string | null
 *     url:         string | null
 *     source:      string  (publisher name)
 *     publishedAt: string | null  (ISO)
 *     imageUrl:    string | null
 *     category:    'local' | 'national' | 'business'
 *     tickers:     string[]  (from newsdata.io's ai_tag, may be empty)
 *     sentiment:   'positive' | 'negative' | 'neutral' | null
 *   }
 *
 * All public methods never throw — on failure they log a warning
 * and return []. A broken news feed should never crash the dashboard.
 */

const API_KEY = import.meta.env.VITE_NEWSDATA_KEY
const BASE_URL = 'https://newsdata.io/api/1'

if (!API_KEY) {
  console.warn(
    '[news] VITE_NEWSDATA_KEY missing. News service will return empty arrays.'
  )
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * Normalize a newsdata.io article into our canonical shape.
 * newsdata.io's response has a lot of fields we don't use yet
 * (creator, keywords, country, language, video_url, etc.). We
 * pick only what the Dashboard actually needs. When we add
 * features later, add fields here, not at the component layer.
 */
function normalizeArticle(raw, category) {
  // newsdata.io article_id is a hash, stable across paginations.
  // Fall back to link + pubDate if missing.
  const id = raw.article_id || `${raw.link || ''}__${raw.pubDate || ''}`

  // ai_tag is an array of strings like ["apple", "stock market", "aapl"].
  // We try to extract uppercase ticker-like tokens. This is best-effort;
  // Massive's news endpoint gives us real ticker arrays later for the
  // Watchlist page.
  const tickers = extractTickers(raw.ai_tag)

  return {
    id,
    title: (raw.title || '').trim(),
    description: raw.description?.trim() || null,
    url: raw.link || null,
    source: raw.source_name || raw.source_id || 'Unknown source',
    publishedAt: raw.pubDate || null,
    imageUrl: raw.image_url || null,
    category,
    tickers,
    sentiment: raw.sentiment || null,
  }
}

/**
 * Best-effort ticker extraction from newsdata.io ai_tag field.
 * We look for 1-5 uppercase letter tokens, which matches typical
 * US equity symbols. Not perfect (misses BRK.B, ^GSPC, etc.) but
 * good enough for the Dashboard's visual ticker pills.
 */
function extractTickers(aiTags) {
  if (!Array.isArray(aiTags)) return []
  const candidates = new Set()
  for (const tag of aiTags) {
    if (typeof tag !== 'string') continue
    // Match standalone 1-5 uppercase letters
    const match = tag.match(/\b([A-Z]{1,5})\b/)
    if (match) candidates.add(match[1])
  }
  // Filter out obvious non-tickers (common all-caps words)
  const blocklist = new Set([
    'US', 'USA', 'UK', 'EU', 'CEO', 'CFO', 'IPO', 'GDP', 'AI',
    'API', 'SEC', 'FBI', 'CIA', 'NYSE', 'NASDAQ', 'ETF', 'IRS',
    'FED', 'FOMC', 'ESG', 'NFT', 'IT', 'PR', 'HR', 'TV', 'USD',
  ])
  return [...candidates].filter((t) => !blocklist.has(t)).slice(0, 3)
}

/**
 * Dedupe articles by normalized title. newsdata.io aggregates from
 * 87,000+ sources so the same AP/Reuters wire story shows up many
 * times. We keep the first occurrence, drop the rest.
 */
function dedupe(articles) {
  const seen = new Set()
  const out = []
  for (const article of articles) {
    const key = (article.title || '')
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

/**
 * Core fetch wrapper. Handles auth, errors, and empty responses.
 * Never throws to the caller — a broken feed returns [] and logs.
 *
 * newsdata.io quirk: the API key is a query param (`apikey=`),
 * not a header. Don't "fix" this to an Authorization header or
 * nothing will work.
 */
async function fetchFromNewsdata(endpoint, params, category) {
  if (!API_KEY) return []

  const url = new URL(`${BASE_URL}/${endpoint}`)
  url.searchParams.set('apikey', API_KEY)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      // Common error codes worth distinguishing:
      //   401 = bad/missing API key
      //   422 = invalid parameter (e.g., too-long query string)
      //   429 = rate limit exceeded
      console.warn(`[news] ${endpoint} returned ${res.status}`)
      return []
    }
    const data = await res.json()
    if (data.status !== 'success' || !Array.isArray(data.results)) {
      console.warn('[news] unexpected response shape', data.status)
      return []
    }
    return data.results.map((raw) => normalizeArticle(raw, category))
  } catch (err) {
    console.warn(`[news] ${endpoint} failed:`, err.message)
    return []
  }
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Local news for a given US state.
 *
 * Uses the /latest endpoint with a keyword search scoped to the
 * user's state. We include politics+business categories because
 * both matter for the investment lens.
 *
 * Per the Pass 3 scope decision: simple q=<state> for now.
 * Tightening (Phoenix/Tucson/Scottsdale OR) deferred.
 */
async function fetchLocal({ state = 'Arizona' } = {}) {
  const articles = await fetchFromNewsdata(
    'latest',
    {
      q: state,
      country: 'us',
      category: 'politics,business',
      language: 'en',
      size: 10, // free tier max per credit
    },
    'local'
  )
  return dedupe(articles)
}

/**
 * National US news — politics, policy, top headlines.
 * Uses /latest with country=us filter.
 */
async function fetchNational() {
  const articles = await fetchFromNewsdata(
    'latest',
    {
      country: 'us',
      category: 'politics,top',
      language: 'en',
      size: 10,
    },
    'national'
  )
  return dedupe(articles)
}

/**
 * Business / markets news — earnings, M&A, Fed, macro.
 * Uses the dedicated /market endpoint which is purpose-built
 * for financial news. On free tier we don't use the symbol= filter
 * (we save that for the Watchlist page in Pass 4, which will
 * probably use Massive's news endpoint anyway).
 */
async function fetchBusiness() {
  const articles = await fetchFromNewsdata(
    'market',
    {
      language: 'en',
      size: 10,
    },
    'business'
  )
  return dedupe(articles)
}

/**
 * Fetch all three categories in parallel. Returns:
 *   { local, national, business, all }
 * where `all` is a deduped union of the other three. The Dashboard
 * uses `all` for the default view and the categorized arrays for
 * the filtered tabs.
 *
 * Cost: 3 API credits per call (one per category), up to 30 articles
 * total. At 200 credits/day we can call this ~66 times/day, which
 * is far more than any single user will do.
 */
async function fetchAll({ state = 'Arizona' } = {}) {
  const [local, national, business] = await Promise.all([
    fetchLocal({ state }),
    fetchNational(),
    fetchBusiness(),
  ])
  const all = dedupe([...business, ...national, ...local])
  // ^ Business/National first in the union so the combined feed
  //   leads with market-relevant content. Deduping preserves order.
  return { local, national, business, all }
}

export const newsService = {
  fetchLocal,
  fetchNational,
  fetchBusiness,
  fetchAll,
}