import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- Watchlist CRUD ----

const USER_ID = 'default' // TODO Pass D: replace with real auth user ID

export const watchlistApi = {
  /**
   * Get all watchlist items for the current user.
   */
  async list() {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', USER_ID)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  /**
   * Add a ticker to the watchlist.
   * @param {object} item - { symbol, name, exchange, addedPrice }
   */
  async add({ symbol, name, exchange, addedPrice }) {
    const { data, error } = await supabase
      .from('watchlist')
      .insert({
        user_id: USER_ID,
        symbol: symbol.toUpperCase(),
        name: name || '',
        exchange: exchange || null,
        added_price: addedPrice || null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Remove a ticker from the watchlist by its row ID.
   */
  async remove(id) {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('id', id)
      .eq('user_id', USER_ID)
    if (error) throw error
  },

  /**
   * Update alert price for a watchlist item.
   */
  async setAlert(id, alertPrice) {
    const { error } = await supabase
      .from('watchlist')
      .update({ alert_price: alertPrice })
      .eq('id', id)
      .eq('user_id', USER_ID)
    if (error) throw error
  },
}