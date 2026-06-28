/**
 * Research Service -- Supabase Edge Function wrapper
 * Calls the research-brief Edge Function for ticker dossiers.
 */

import { supabase } from '../supabase'

async function getTickerBrief(symbol) {
  const { data, error } = await supabase.functions.invoke('research-brief', {
    body: { symbol },
  })

  if (error) {
    throw new Error(error.message || 'Research brief unavailable')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

/**
 * Deep-dive dossier: structured bull/bear/dividend/risk/fit analysis from the
 * research-deep-dive agent. Slower than getTickerBrief (fans out across data
 * sources + a Sonnet synthesis), so call it on demand, not on first load.
 * Personalizes the fit verdict to the signed-in user's rules + holdings.
 */
async function getDeepDive(symbol) {
  const { data, error } = await supabase.functions.invoke('research-deep-dive', {
    body: { symbol },
  })

  if (error) {
    throw new Error(error.message || 'Deep dive unavailable')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export const researchService = {
  getTickerBrief,
  getDeepDive,
}