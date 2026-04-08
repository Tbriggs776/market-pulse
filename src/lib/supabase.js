import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Watchlist operations
export const watchlistApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async add(symbol, name) {
    const { data, error } = await supabase
      .from('watchlist')
      .insert([{ symbol, name }])
      .select()
    if (error) throw error
    return data[0]
  },

  async remove(id) {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// Portfolio operations
export const portfolioApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('portfolio')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async add(holding) {
    const { data, error } = await supabase
      .from('portfolio')
      .insert([holding])
      .select()
    if (error) throw error
    return data[0]
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('portfolio')
      .update(updates)
      .eq('id', id)
      .select()
    if (error) throw error
    return data[0]
  },

  async remove(id) {
    const { error } = await supabase
      .from('portfolio')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

// Research notes operations
export const researchApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('research_notes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async add(note) {
    const { data, error } = await supabase
      .from('research_notes')
      .insert([note])
      .select()
    if (error) throw error
    return data[0]
  },

  async remove(id) {
    const { error } = await supabase
      .from('research_notes')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}
