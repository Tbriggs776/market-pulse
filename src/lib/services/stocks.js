/**
 * Stocks Service -- Supabase Edge Function wrapper
 * -------------------------------------------------
 * Calls the stock-quote Edge Function for price data.
 * Polygon/Massive API key stays server-side.
 */

import { supabase } from '../supabase'

/**
 * Fetch quotes for an array of ticker symbols.
 * Returns a map: { AAPL: { price, change, changePercent, ... }, ... }
 */
async function getQuotes(symbols) {
  if (!symbols || symbols.length === 0) return {}

  try {
    const { data, error } = await supabase.functions.invoke('stock-quote', {
      body: { symbols },
    })
    if (error) {
      console.warn('[stocks] getQuotes failed:', error.message)
      return {}
    }
    return data?.quotes || {}
  } catch (err) {
    console.warn('[stocks] getQuotes failed:', err.message)
    return {}
  }
}

/**
 * Look up a ticker symbol to get company name, exchange, and current price.
 * Used when adding a new ticker to the watchlist.
 * Returns: { name, exchange, quote } or null if not found.
 */
async function lookupTicker(symbol) {
  try {
    const { data, error } = await supabase.functions.invoke('stock-quote', {
      body: { lookup: symbol },
    })
    if (error) {
      console.warn('[stocks] lookupTicker failed:', error.message)
      return null
    }
    return data
  } catch (err) {
    console.warn('[stocks] lookupTicker failed:', err.message)
    return null
  }
}

export const stocksService = {
  getQuotes,
  lookupTicker,
}