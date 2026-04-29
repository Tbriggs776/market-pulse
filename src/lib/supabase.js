import { createClient } from '@supabase/supabase-js'
import { computePositions, parsePositionId, defaultLotMethod } from './positionEngine'

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

// ---- Transactions (source of truth for portfolio state) ----
// Positions are derived via chronological replay -- see positionEngine.js.

export const transactionsApi = {
  async list({ symbol, assetType, limit } = {}) {
    const userId = await getUserId()
    let q = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (symbol) q = q.eq('symbol', symbol.toUpperCase())
    if (assetType) q = q.eq('asset_type', assetType)
    if (limit) q = q.limit(limit)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async add({
    symbol,
    name,
    assetType,
    transactionType,
    shares,
    pricePerShare,
    totalAmount,
    occurredAt,
    notes,
    source,
    lotMethod,
  }) {
    const userId = await getUserId()
    const sharesNum = shares != null ? Number(shares) : null
    const priceNum = pricePerShare != null ? Number(pricePerShare) : null
    const computedAmount = totalAmount != null
      ? Number(totalAmount)
      : (sharesNum != null && priceNum != null ? sharesNum * priceNum : null)
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        symbol: symbol.toUpperCase(),
        name: name || null,
        asset_type: assetType,
        transaction_type: transactionType,
        shares: sharesNum,
        price_per_share: priceNum,
        total_amount: computedAmount != null ? Math.round(computedAmount * 100) / 100 : null,
        occurred_at: occurredAt || new Date().toISOString().slice(0, 10),
        notes: notes || null,
        source: source || 'manual',
        lot_method: transactionType === 'sell' ? (lotMethod || null) : null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, patch) {
    const userId = await getUserId()
    const updates = {}
    if (patch.shares !== undefined) updates.shares = patch.shares
    if (patch.pricePerShare !== undefined) updates.price_per_share = patch.pricePerShare
    if (patch.totalAmount !== undefined) updates.total_amount = patch.totalAmount
    if (patch.occurredAt !== undefined) updates.occurred_at = patch.occurredAt
    if (patch.notes !== undefined) updates.notes = patch.notes
    if (patch.transactionType !== undefined) updates.transaction_type = patch.transactionType
    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
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
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
  },
}

// ---- Investment Rules ----
// User's stated investment policy: goals, horizon, risk, etc. Drives both
// the AI suggestions surface and the advisor's system-prompt context.

export const investmentRulesApi = {
  // Returns the row or null. Null = first-time user (no row yet).
  async get() {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('investment_rules')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data || null
  },

  // Upsert: first call inserts, subsequent calls update.
  async save(rules) {
    const userId = await getUserId()
    const payload = {
      user_id: userId,
      goal: rules.goal || null,
      time_horizon: rules.timeHorizon || null,
      risk_tolerance: rules.riskTolerance || null,
      income_need: rules.incomeNeed || null,
      experience: rules.experience || null,
      account_type: rules.accountType || null,
      capital_range: rules.capitalRange || null,
      exclusions: rules.exclusions || null,
      onboarding_status: 'completed',
    }
    const { data, error } = await supabase
      .from('investment_rules')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Marks a "skip for now" -- creates an empty row so the popup doesn't
  // re-fire. User can still complete via /profile later.
  async dismiss() {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('investment_rules')
      .upsert(
        { user_id: userId, onboarding_status: 'dismissed' },
        { onConflict: 'user_id' }
      )
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ---- Investment Suggestions ----
// Read-only from the client; writes happen in the generate-suggestions
// edge function so the AI prompt + parsing logic stays server-side.

export const investmentSuggestionsApi = {
  async list() {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('investment_suggestions')
      .select('*')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async remove(id) {
    const userId = await getUserId()
    const { error } = await supabase
      .from('investment_suggestions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw error
  },
}

// ---- Portfolio (derived from transactions) ----
// list()    fetches all transactions and computes current positions.
// add()     writes a BUY transaction (preserves the Pass 11 UX).
// sell()    writes a SELL transaction -- advisor apply uses this so realized
//           P&L is preserved in history.
// remove()  erases transaction history for a (symbol, asset_type) -- matches
//           the Portfolio trash button semantic ("I never owned this").

export const portfolioApi = {
  async list() {
    const userId = await getUserId()
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return computePositions(data || [])
  },

  async add({ symbol, name, assetType, shares, costBasisPerShare, purchaseDate, notes }) {
    return transactionsApi.add({
      symbol,
      name,
      assetType,
      transactionType: 'buy',
      shares,
      pricePerShare: costBasisPerShare,
      occurredAt: purchaseDate || null,
      notes,
    })
  },

  async sell({ symbol, assetType, shares, pricePerShare, occurredAt, notes, lotMethod }) {
    return transactionsApi.add({
      symbol,
      assetType,
      transactionType: 'sell',
      shares,
      pricePerShare,
      occurredAt: occurredAt || null,
      notes,
      lotMethod: lotMethod || defaultLotMethod(assetType),
    })
  },

  async remove(positionId) {
    const parsed = parsePositionId(positionId)
    if (!parsed) throw new Error(`Invalid position id: ${positionId}`)
    const userId = await getUserId()
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .eq('symbol', parsed.symbol)
      .eq('asset_type', parsed.assetType)
    if (error) throw error
  },
}