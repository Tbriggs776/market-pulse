/**
 * Market Overview Service -- Supabase Edge Function wrapper
 */

import { supabase } from '../supabase'

async function getOverview() {
  const { data, error } = await supabase.functions.invoke('market-overview', {
    body: {},
  })

  if (error) {
    throw new Error(error.message || 'Market overview unavailable')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export const marketService = {
  getOverview,
}