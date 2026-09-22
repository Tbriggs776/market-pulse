// Geopolitics scoring from news_articles or NewsData
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { GEO_KEYWORDS, NEWSDATA_BASE, type GeoItem } from './constants.ts'

function scoreText(title: string, description: string | null): {
  score: number
  reason: string[]
} {
  const text = `${title} ${description || ''}`.toLowerCase()
  let score = 0
  const matched: string[] = []
  for (const { term, weight } of GEO_KEYWORDS) {
    if (text.includes(term)) {
      score += weight
      matched.push(term)
    }
  }
  return { score, reason: matched }
}

export async function fetchGeopoliticsFromDb(
  supabaseUrl: string,
  serviceKey: string,
): Promise<GeoItem[]> {
  const supabase = createClient(supabaseUrl, serviceKey)
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('news_articles')
    .select('title, description, source, url, category, published_at')
    .in('category', ['national', 'business'])
    .gt('published_at', cutoff)
    .order('published_at', { ascending: false })
    .limit(30)

  if (error) {
    console.warn('[hourly-scoreboard] news_articles:', error.message)
    throw new Error(`news_articles: ${error.message}`)
  }

  const scored: GeoItem[] = []
  for (const row of data || []) {
    const { score, reason } = scoreText(row.title || '', row.description)
    if (score >= 2) {
      scored.push({
        title: row.title,
        source: row.source || 'Unknown',
        url: row.url || '',
        score,
        reason: reason.join(', '),
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3)
}

export async function fetchGeopoliticsFromNewsdata(
  apiKey: string,
): Promise<GeoItem[]> {
  const q = '("Federal Reserve" OR war OR oil OR tariffs)'
  const url = new URL(`${NEWSDATA_BASE}/latest`)
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('q', q)
  url.searchParams.set('country', 'us')
  url.searchParams.set('category', 'politics,business,world')
  url.searchParams.set('language', 'en')
  url.searchParams.set('size', '10')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.warn(`[hourly-scoreboard] newsdata: ${res.status}`)
    return []
  }
  const data = await res.json()
  if (data.status !== 'success' || !Array.isArray(data.results)) return []

  const scored: GeoItem[] = []
  for (const raw of data.results) {
    const title = (raw.title as string) || ''
    const description = (raw.description as string) || null
    const { score, reason } = scoreText(title, description)
    if (score >= 2) {
      scored.push({
        title,
        source:
          (raw.source_name as string) ||
          (raw.source_id as string) ||
          'Unknown',
        url: (raw.link as string) || '',
        score,
        reason: reason.join(', '),
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3)
}
