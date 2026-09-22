/**
 * Hourly Scoreboard Service -- Supabase Edge Function wrapper
 * Wire + Dashboard pulse: rates, risk ETFs, geopolitics, silent/regime.
 */

import { supabase } from '../supabase'

async function getScoreboard() {
  const { data, error } = await supabase.functions.invoke('hourly-scoreboard', {
    body: {},
  })

  if (error) {
    throw new Error(error.message || 'Hourly scoreboard unavailable')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export const hourlyScoreboardService = {
  getScoreboard,
}
