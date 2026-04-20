/**
 * Metadata Service -- Supabase Edge Function wrapper
 * Calls the asset-metadata Edge Function for ticker sector/industry data.
 */

import { supabase } from '../supabase'

/**
 * Fetch metadata (sector, industry, type) for an array of symbols.
 * Returns a map: { AAPL: { sector, industry, type, name }, ... }
 */
async function getMetadata(symbols) {
  if (!symbols || symbols.length === 0) return {}

  try {
    const { data, error } = await supabase.functions.invoke('asset-metadata', {
      body: { symbols },
    })
    if (error) {
      console.warn('[metadata] getMetadata failed:', error.message)
      return {}
    }
    return data?.metadata || {}
  } catch (err) {
    console.warn('[metadata] getMetadata failed:', err.message)
    return {}
  }
}

export const metadataService = {
  getMetadata,
}
