/**
 * Treasury Service -- Supabase Edge Function wrapper
 */

import { supabase } from '../supabase'

async function getFiscalOverview() {
  const { data, error } = await supabase.functions.invoke('treasury-data', {
    body: {},
  })

  if (error) {
    throw new Error(error.message || 'Treasury data unavailable')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export const treasuryService = {
  getFiscalOverview,
}