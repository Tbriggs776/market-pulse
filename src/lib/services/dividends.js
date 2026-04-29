/**
 * Dividends Service -- Supabase Edge Function wrapper
 * Calls the dividend-history Edge Function for per-ticker dividend
 * summaries: latest payment, annualized amount, frequency, growth rate,
 * and the last few years of events.
 */

import { supabase } from '../supabase'

async function getDividendHistory(symbols) {
  if (!symbols || symbols.length === 0) return {}

  try {
    const { data, error } = await supabase.functions.invoke('dividend-history', {
      body: { symbols },
    })
    if (error) {
      console.warn('[dividends] getDividendHistory failed:', error.message)
      return {}
    }
    return data?.dividends || {}
  } catch (err) {
    console.warn('[dividends] getDividendHistory failed:', err.message)
    return {}
  }
}

export const dividendsService = {
  getDividendHistory,
}
