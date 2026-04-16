/**
 * Budget Baseline Service -- CBO/OMB projections via Edge Function
 */
import { supabase } from '../supabase'

async function getBaseline(fiscalYear = 2026) {
  const { data, error } = await supabase.functions.invoke('budget-baseline', {
    body: { fiscalYear },
  })
  if (error) throw new Error(error.message || 'Budget baseline unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

export const budgetService = { getBaseline }