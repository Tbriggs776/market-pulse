import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- Helper: get current user ID ----

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

// ---- Watchlist CRUD ----

export const watchlistApi = {
  async list() {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async add({ symbol, name, exchange, addedPrice }) {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('watchlist')
      .insert({
        user_id: userId,
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

  async remove(id) {
    const userId = await getUserId()
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
  },

  async setAlert(id, alertPrice) {
    const userId = await getUserId()
    const { error } = await supabase
      .from('watchlist')
      .update({ alert_price: alertPrice })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
  },
}

// ---- Research Bench CRUD ----

export const benchApi = {
  async list() {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('research_bench')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async add({ symbol, name, sector }) {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('research_bench')
      .insert({
        user_id: userId,
        symbol: symbol.toUpperCase(),
        name: name || '',
        sector: sector || null,
        status: 'evaluating',
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStatus(id, status) {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('research_bench')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateNotes(id, notes) {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('research_bench')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id) {
    const userId = await getUserId()
    const { error } = await supabase
      .from('research_bench')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
  },

  async promoteToWatchlist(id) {
    // Get the bench item, add to watchlist, remove from bench
    const userId = await getUserId()
    const { data: item, error: fetchErr } = await supabase
      .from('research_bench')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    if (fetchErr) throw fetchErr

    // Add to watchlist (addedPrice will be fetched by the caller)
    await watchlistApi.add({
      symbol: item.symbol,
      name: item.name,
      exchange: null,
      addedPrice: null,
    })

    // Remove from bench
    await supabase
      .from('research_bench')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
  },
}