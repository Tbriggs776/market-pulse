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

export const researchService = {
  getTickerBrief,
}