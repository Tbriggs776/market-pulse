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

export const newsService = {
  fetchLocal,
  fetchNational,
  fetchBusiness,
  fetchAll,
}