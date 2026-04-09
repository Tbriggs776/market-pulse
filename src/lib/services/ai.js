/**
 * AI Service — Supabase Edge Function wrapper
 * ────────────────────────────────────────────────────────────
 * Frontend-facing interface for Claude-powered features. Never
 * calls Anthropic directly — always proxies through the Supabase
 * Edge Functions in supabase/functions/*, which hold the secret
 * API key server-side.
 *
 * Public API:
 *   generateBriefing(articles, state) → { briefing, generatedAt, model }
 *
 * Future methods will be added here as more Edge Functions come
 * online (analyze-stock, research-narrative, advisor-chat, etc.).
 */

import { supabase } from '../supabase'

/**
 * Generate the Dashboard's daily briefing.
 *
 * Uses Supabase's functions.invoke() which handles auth headers
 * automatically — we don't need to manually attach the anon key.
 * It also returns a consistent { data, error } shape regardless
 * of whether the function returned success or failure, so error
 * handling is uniform.
 */
async function generateBriefing(articles, state = 'Arizona') {
  // Shape the articles down to only what the function needs.
  // We don't send url, imageUrl, tickers, etc. — Claude doesn't
  // use them and sending them just wastes input tokens.
  const trimmed = articles.map((a) => ({
    title: a.title,
    description: a.description,
    source: a.source,
    category: a.category,
  }))

  const { data, error } = await supabase.functions.invoke('generate-briefing', {
    body: { articles: trimmed, state },
  })

  if (error) {
    const message =
      error.context?.error ||
      error.message ||
      'Briefing service unavailable'
    throw new Error(message)
  }

  if (!data || !data.briefing) {
    throw new Error('Briefing service returned an empty response')
  }

  return {
    briefing: data.briefing,
    generatedAt: data.generatedAt,
    model: data.model,
  }
}

export const aiService = {
  generateBriefing,
}
