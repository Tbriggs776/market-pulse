/**
 * Suggestions Service -- wraps the generate-suggestions Edge Function.
 * Reads the user's Investment Rules server-side and asks Claude to
 * produce a curated ticker list. Persists the result.
 */

import { supabase } from '../supabase'

async function generate() {
  const { data, error } = await supabase.functions.invoke('generate-suggestions', {
    body: {},
  })
  if (error) {
    throw new Error(error.message || 'Could not generate suggestions')
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  return {
    suggestions: data?.suggestions || [],
    summary: data?.summary || '',
  }
}

export const suggestionsService = {
  generate,
}
