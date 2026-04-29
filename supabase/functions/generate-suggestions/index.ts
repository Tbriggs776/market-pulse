// Supabase Edge Function: generate-suggestions
// Runtime: Deno
//
// Reads the user's Investment Rules and asks Claude to produce a curated
// list of 5-10 specific tickers across categories. Persists results to
// investment_suggestions, replacing any prior set.
//
// Secrets required: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// POST /functions/v1/generate-suggestions
// Body: {} (rules read from DB)
// Response: { suggestions: [...], summary: string }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You are a portfolio construction assistant for the Market Pulse research tool. Given an investor's stated rules, recommend 5 to 10 specific, real, currently-trading US tickers grouped by role in the portfolio.

Categories you may use:
- core: broad-market diversified positions (typically ETFs)
- growth: equity exposure to growth themes
- income: dividend or yield generators
- satellite: thematic or sector-specific positions
- defensive: bonds, treasuries, capital preservation

Output ONLY a JSON object. No preamble, no markdown fences, no explanation. Schema:
{
  "summary": "1-2 sentence summary of the overall portfolio approach you're recommending for THIS user",
  "suggestions": [
    {
      "symbol": "VTI",
      "name": "Vanguard Total Stock Market ETF",
      "assetType": "etf",
      "category": "core",
      "rationale": "1-3 sentences on why this fits THIS user's specific rules. Reference their goal/horizon/risk where relevant.",
      "riskFit": "conservative" | "moderate" | "aggressive"
    }
  ]
}

Constraints:
- Real, currently-trading tickers only. Polygon-trackable. Common US listings (NYSE/NASDAQ/BATS).
- 5 to 10 items total.
- assetType is one of: stock | etf | mutual_fund.
- Match the user's risk tolerance, time horizon, and income need.
- For taxable accounts, prefer tax-efficient ETFs over high-turnover funds.
- For income_need = primary, weight income-generators meaningfully.
- For under $10k initial capital, lean toward low-cost diversified ETFs over individual stocks.
- Respect the user's exclusions verbatim (sectors, companies, leverage, etc).
- Never recommend leveraged or inverse ETFs.
- Educational only. Do NOT promise outcomes. Frame rationales as "this fits because..." not "this will perform..."`

async function fetchClaudeJSON(systemPrompt: string, userPrompt: string): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data?.content?.[0]?.text
  if (!text) throw new Error('Claude returned empty content')
  return text
}

// Claude sometimes wraps JSON in ```json``` fences or adds a stray sentence
// despite the instruction. Trim to the outermost {...} so JSON.parse works.
function extractJSON(raw: string): any {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('No JSON object found in model response')
  }
  return JSON.parse(raw.slice(start, end + 1))
}

interface RawSuggestion {
  symbol?: string
  name?: string
  assetType?: string
  category?: string
  rationale?: string
  riskFit?: string
}

function normalizeSuggestion(s: RawSuggestion): RawSuggestion | null {
  const symbol = String(s.symbol || '').toUpperCase().trim()
  if (!symbol || symbol.length > 6) return null
  const assetType = ['stock', 'etf', 'mutual_fund'].includes(String(s.assetType))
    ? s.assetType
    : 'stock'
  const category = ['core', 'growth', 'income', 'satellite', 'defensive'].includes(String(s.category))
    ? s.category
    : 'core'
  const riskFit = ['conservative', 'moderate', 'aggressive'].includes(String(s.riskFit))
    ? s.riskFit
    : 'moderate'
  return {
    symbol,
    name: String(s.name || '').slice(0, 200),
    assetType,
    category,
    rationale: String(s.rationale || '').slice(0, 600),
    riskFit,
  }
}

function formatRulesPrompt(r: any): string {
  const lines = [
    'Generate suggestions for an investor with the following rules:',
    '',
    `- Primary goal: ${r.goal || 'unspecified'}`,
    `- Time horizon: ${r.time_horizon || 'unspecified'}`,
    `- Risk tolerance: ${r.risk_tolerance || 'unspecified'}`,
    `- Income need from portfolio: ${r.income_need || 'unspecified'}`,
    `- Investment experience: ${r.experience || 'unspecified'}`,
    `- Account type: ${r.account_type || 'unspecified'}`,
    `- Initial capital range: ${r.capital_range || 'unspecified'}`,
  ]
  if (r.exclusions && r.exclusions.trim()) {
    lines.push(`- Things to avoid: ${r.exclusions.slice(0, 500)}`)
  }
  return lines.join('\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    const userId = userData.user.id

    const { data: rules, error: rulesErr } = await supabaseAdmin
      .from('investment_rules')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (rulesErr) throw rulesErr
    if (!rules || rules.onboarding_status !== 'completed') {
      return new Response(JSON.stringify({
        error: 'Investment Rules not completed -- finish the questionnaire before generating suggestions',
      }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const userPrompt = formatRulesPrompt(rules)
    const raw = await fetchClaudeJSON(SYSTEM_PROMPT, userPrompt)
    let parsed: any
    try {
      parsed = extractJSON(raw)
    } catch (err) {
      console.error('[generate-suggestions] parse failed:', err, 'raw:', raw.slice(0, 500))
      throw new Error('Could not parse model response as JSON')
    }

    const summary = String(parsed?.summary || '').slice(0, 500)
    const rawArr = Array.isArray(parsed?.suggestions) ? parsed.suggestions : []
    const cleaned = rawArr
      .map(normalizeSuggestion)
      .filter((s: any): s is RawSuggestion => s !== null)
      .slice(0, 10)
    if (cleaned.length === 0) {
      throw new Error('Model returned no usable suggestions')
    }

    // Replace prior suggestion set with the freshly-generated batch.
    await supabaseAdmin
      .from('investment_suggestions')
      .delete()
      .eq('user_id', userId)

    const rows = cleaned.map((s: any) => ({
      user_id: userId,
      symbol: s.symbol,
      asset_type: s.assetType,
      name: s.name,
      category: s.category,
      rationale: s.rationale,
      risk_fit: s.riskFit,
    }))
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('investment_suggestions')
      .insert(rows)
      .select()
    if (insertErr) throw insertErr

    return new Response(
      JSON.stringify({ suggestions: inserted, summary }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[generate-suggestions] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
