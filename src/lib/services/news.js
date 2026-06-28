/**
 * News Service -- Supabase Edge Function wrapper
 * ------------------------------------------------
 * All newsdata.io calls now go through the fetch-news Edge
 * Function. The API key lives server-side as a Supabase secret.
 * The browser never sees it.
 *
 * Returned article shape (canonical):
 *   Article = {
 *     id, title, description, url, source, publishedAt,
 *     imageUrl, category, tickers, sentiment
 *   }
 *
 * All public methods never throw -- on failure they log a
 * warning and return []. A broken news feed should never
 * crash the dashboard.
 */

import { supabase } from '../supabase'

async function invokeNews(category, state = 'Arizona') {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-news', {
      body: { category, state },
    })

    if (error) {
      console.warn(`[news] ${category} failed:`, error.message)
      return category === 'all' ? { local: [], national: [], business: [], all: [] } : []
    }

    return data
  } catch (err) {
    console.warn(`[news] ${category} failed:`, err.message)
    return category === 'all' ? { local: [], national: [], business: [], all: [] } : []
  }
}

async function fetchLocal({ state = 'Arizona' } = {}) {
  const data = await invokeNews('local', state)
  return data?.articles || data || []
}

async function fetchNational() {
  const data = await invokeNews('national')
  return data?.articles || data || []
}

async function fetchBusiness() {
  const data = await invokeNews('business')
  return data?.articles || data || []
}

async function fetchAll({ state = 'Arizona' } = {}) {
  const data = await invokeNews('all', state)
  // The Edge Function returns { all, local, national, business }
  // when category is 'all'
  if (data && data.all) {
    return {
      all: data.all,
      local: data.local || [],
      national: data.national || [],
      business: data.business || [],
    }
  }
  // Fallback if shape is unexpected
  return { local: [], national: [], business: [], all: [] }
}

/**
 * Portfolio-aware curated feed. Calls the curate-news Edge Function, which
 * scores every article against the user's holdings/watchlist/rules and adds a
 * `forYou` lens plus per-article `relevance` / `matchedTickers` annotations.
 *
 * For guests, pass `anonymousContext: { watchlist, transactions }` so the
 * curator has something to anchor on (the function reads authed users from the
 * DB via their session token automatically).
 *
 * Never throws and always returns the canonical fetchAll shape (plus the
 * curation extras): on any failure it transparently falls back to the
 * uncurated feed so the dashboard always renders.
 */
async function fetchCurated({ state = 'Arizona', anonymousContext = null } = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('curate-news', {
      body: { state, anonymousContext },
    })
    if (error || !data || !data.all) {
      if (error) console.warn('[news] curate failed, using base feed:', error.message)
      const base = await fetchAll({ state })
      return { ...base, forYou: [], curated: false, profileTickers: [] }
    }
    return {
      all: data.all,
      local: data.local || [],
      national: data.national || [],
      business: data.business || [],
      forYou: data.forYou || [],
      curated: Boolean(data.curated),
      profileTickers: data.profileTickers || [],
    }
  } catch (err) {
    console.warn('[news] curate threw, using base feed:', err.message)
    const base = await fetchAll({ state })
    return { ...base, forYou: [], curated: false, profileTickers: [] }
  }
}

export const newsService = {
  fetchLocal,
  fetchNational,
  fetchBusiness,
  fetchAll,
  fetchCurated,
}