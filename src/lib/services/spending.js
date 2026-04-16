/**
 * Spending Service -- Supabase Edge Function wrapper
 */

import { supabase } from '../supabase'

async function getSpendingOverview() {
  const { data, error } = await supabase.functions.invoke('spending-data', {
    body: { type: 'all' },
  })
  if (error) throw new Error(error.message || 'Spending data unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

async function getAgencies() {
  const { data, error } = await supabase.functions.invoke('spending-data', {
    body: { type: 'agencies' },
  })
  if (error) throw new Error(error.message || 'Agency data unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

export const spendingService = {
  getSpendingOverview,
  getAgencies,
}