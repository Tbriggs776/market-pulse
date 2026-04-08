import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Watchlist operations
 *
 * Schema (existing table `watchlist`):
 *   id          uuid pk
 *   symbol      text
 *   name        text
 *   exchange    text       (added in migration 002, see TODO below)
 *   added_price numeric    (added in migration 002)
 *   alert_price numeric    (added in migration 002, nullable)
 *   created_at  timestamp
 *
 * TODO: The current Supabase `watchlist` table only has symbol/name/created_at.
 * We need to run a migration to add exchange/added_price/alert_price columns
 * before the new Watchlist page (Phase 2) will work end-to-end. The migration
 * SQL is documented in /docs/migrations.md (created in Pass 2).
 */
export const watchlistApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async add({ symbol, name, exchange = null, addedPrice = null }) {
    const { data, error } = await supabase
      .from('watchlist')
      .insert([{
        symbol,
        name,
        exchange,
        added_price: addedPrice
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async setAlert(id, alertPrice) {
    const { data, error } = await supabase
      .from('watchlist')
      .update({ alert_price: alertPrice })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// Note: portfolioApi and researchApi were removed in Pass 1.
// Portfolio: was pointing at a non-existent `portfolio` table.
//   Will be rebuilt against `portfolios` + `portfolio_holdings` in Phase 4.
// Research notes: feature not in the Phase 1-3 scope. Will return when needed.