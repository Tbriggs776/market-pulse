/**
 * Calendar Service -- Supabase Edge Function wrapper
 * Calls the catalyst-calendar agent for a forward calendar of ex-dividend,
 * pay-date, and (when FMP is configured) earnings catalysts across the user's
 * holdings + watchlist.
 *
 * Guests have no server-side portfolio, so pass
 * `anonymousContext: { watchlist, transactions }` from the session store.
 */
import { supabase } from '../supabase'

async function getCalendar({ horizonDays, anonymousContext = null } = {}) {
  const { data, error } = await supabase.functions.invoke('catalyst-calendar', {
    body: { horizonDays, anonymousContext },
  })
  if (error) throw new Error(error.message || 'Calendar unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

export const calendarService = { getCalendar }
