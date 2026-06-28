// Supabase Edge Function: research-deep-dive (Research Deep-Dive agent)
// Runtime: Deno
//
// The fast `research-brief` gives a snapshot + prose thesis. This agent goes
// deeper: it fans out across company details, price history, dividend metrics,
// and live macro context, then asks Claude Sonnet for a STRUCTURED dossier --
// bull case, bear case, dividend profile, key risks, and a fit-to-rules verdict
// personalized to the signed-in user's Investment Rules and current holdings.
//
// Secrets: MASSIVE_API_KEY (Polygon), ANTHROPIC_API_KEY,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// POST /functions/v1/research-deep-dive
// Body: { symbol: "AAPL" }
// Response: { symbol, company, quote, history, dividends, macro, dossier, ... }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MODEL = 'claude-sonnet-4-6'

// --- Polygon: company details ---
async function fetchCompany(apiKey: string, symbol: string) {
  try {
    const res = await fetch(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results) return null
    const r = data.results
    return {
      name: r.name || symbol,
      description: r.description || '',
      sector: r.sic_description || '',
      type: r.type || '',
      exchange: r.primary_exchange || '',
      marketCap: r.market_cap || null,
      homepageUrl: r.homepage_url || null,
      totalEmployees: r.total_employees || null,
      listDate: r.list_date || null,
    }
  } catch {
    return null
  }
}

// --- Polygon: previous close ---
async function fetchQuote(apiKey: string, symbol: string) {
  try {
    const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results || data.results.length === 0) return null
    const r = data.results[0]
    const change = r.c - r.o
    return {
      price: r.c, open: r.o, high: r.h, low: r.l, volume: r.v,
      change: Math.round(change * 100) / 100,
      changePercent: r.o > 0 ? Math.round((change / r.o) * 10000) / 100 : 0,
    }
  } catch {
    return null
  }
}

// --- Polygon: 30-day price history ---
async function fetchHistory(apiKey: string, symbol: string) {
  try {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 45)
    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}?adjusted=true&sort=asc&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (!data.results) return []
    return data.results.map((r: Record<string, unknown>) => ({
      date: new Date(r.t as number).toISOString().split('T')[0],
      close: r.c as number,
      volume: r.v as number,
    }))
  } catch {
    return []
  }
}

async function callInternalFunction(fnName: string, body: any): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Whether the user currently holds `symbol` (net shares > 0).
function holdsSymbol(transactions: any[], symbol: string): { held: boolean; shares: number } {
  let shares = 0
  for (const t of transactions || []) {
    if (String(t.symbol || '').toUpperCase() !== symbol) continue
    const n = Number(t.shares) || 0
    if (t.transaction_type === 'buy') shares += n
    else if (t.transaction_type === 'sell') shares -= n
  }
  return { held: shares > 1e-8, shares: Math.round(shares * 1e6) / 1e6 }
}

function extractJSON(raw: string): any {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) throw new Error('No JSON object in model output')
  return JSON.parse(raw.slice(start, end + 1))
}

function strArray(v: unknown, max = 5): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x).slice(0, 240)).filter(Boolean).slice(0, max)
}

const SYSTEM_PROMPT =
  'You are a senior equity research analyst at an institutional firm writing a structured deep-dive ' +
  'dossier for a CFO who runs dividend-income and conservative-growth portfolios. You are specific, ' +
  'numerate, and honest about risk. You output ONLY a JSON object -- no markdown fences, no prose ' +
  'outside the JSON. No "not financial advice" disclaimers.'

function buildPrompt(opts: {
  symbol: string
  company: any
  quote: any
  history: any[]
  dividends: any
  macroLines: string[]
  fitContext: string
}): string {
  const { symbol, company, quote, history, dividends, macroLines, fitContext } = opts
  const companyInfo = company
    ? `Name: ${company.name}\nSector: ${company.sector}\nMarket cap: ${company.marketCap ? '$' + (Number(company.marketCap) / 1e9).toFixed(1) + 'B' : 'unknown'}\nEmployees: ${company.totalEmployees || 'unknown'}\nDescription: ${String(company.description || '').slice(0, 800)}`
    : `${symbol} (no company detail available)`
  const quoteInfo = quote
    ? `Price $${quote.price}, day ${quote.changePercent}%, range $${quote.low}-$${quote.high}`
    : 'quote unavailable'
  const histInfo = history.length
    ? `30-day range $${Math.min(...history.map((h) => h.close)).toFixed(2)}-$${Math.max(...history.map((h) => h.close)).toFixed(2)} over ${history.length} sessions`
    : 'no recent history'
  const divInfo = dividends?.hasDividends
    ? `Pays ${dividends.frequencyLabel}; latest $${dividends.latestAmount} (ex-date ${dividends.latestExDate}); annualized $${dividends.annualizedAmount}; 5y growth ${dividends.growth5y != null ? (dividends.growth5y * 100).toFixed(1) + '%/yr' : 'n/a'}; ${dividends.paymentsLast5y}/${dividends.expectedLast5y} expected payments in 5y`
    : 'No cash dividend on record'

  return `Write a structured deep-dive dossier for ${symbol}.

DATA
Company:
${companyInfo}

Market: ${quoteInfo}
History: ${histInfo}
Dividend: ${divInfo}
Macro backdrop:
${macroLines.join('\n') || '(unavailable)'}

${fitContext}

Output ONLY this JSON shape:
{
  "snapshot": "1-2 sentences on what the company actually does and its current setup",
  "bullCase": ["2-4 specific, non-generic bullets"],
  "bearCase": ["2-4 specific, non-generic bullets"],
  "dividendProfile": "1-2 sentences on income quality/durability, or null if non-dividend",
  "keyRisks": ["2-4 concrete risks"],
  "fitVerdict": { "rating": "hold" | "research" | "pass", "rationale": "1-2 sentences tied to the user's rules/holdings above" },
  "summary": "one-paragraph synthesis a partner could read in 15 seconds"
}
Be specific to ${symbol}: cite the sector, the dividend cadence, the macro backdrop. Avoid boilerplate.`
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const polygonKey = Deno.env.get('MASSIVE_API_KEY')
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!polygonKey || !claudeKey) {
    return new Response(JSON.stringify({ error: 'API keys not configured' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let body: { symbol?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const symbol = (body.symbol || '').toUpperCase().trim()
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'symbol is required' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Optional auth -> personalize the fit verdict.
  let userId: string | null = null
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(token)
      if (data?.user) userId = data.user.id
    } catch (_) { /* anonymous */ }
  }

  try {
    // Fan out across data sources in parallel.
    const [company, quote, history, divResult, macroResult] = await Promise.all([
      fetchCompany(polygonKey, symbol),
      fetchQuote(polygonKey, symbol),
      fetchHistory(polygonKey, symbol),
      callInternalFunction('dividend-history', { symbols: [symbol] }),
      callInternalFunction('market-overview', {}),
    ])

    if (!company && !quote) {
      return new Response(JSON.stringify({ error: `Could not find data for ${symbol}` }), {
        status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const dividends = divResult?.dividends?.[symbol] || null
    const macroLines: string[] = Array.isArray(macroResult?.macro)
      ? macroResult.macro
          .slice(0, 8)
          .map((m: any) => `- ${m.label}: ${m.value ?? 'n/a'}${m.suffix || ''}`)
      : []

    // Build the personalization block.
    let fitContext = 'USER CONTEXT: anonymous visitor -- give a general fit read for a dividend/conservative-growth portfolio.'
    if (userId) {
      const lines: string[] = []
      try {
        const { data: rules } = await supabaseAdmin
          .from('investment_rules')
          .select('goal, time_horizon, risk_tolerance, income_need, account_type, exclusions, onboarding_status')
          .eq('user_id', userId)
          .maybeSingle()
        if (rules?.onboarding_status === 'completed') {
          if (rules.goal) lines.push(`goal=${rules.goal}`)
          if (rules.time_horizon) lines.push(`horizon=${rules.time_horizon}`)
          if (rules.risk_tolerance) lines.push(`risk=${rules.risk_tolerance}`)
          if (rules.income_need) lines.push(`income_need=${rules.income_need}`)
          if (rules.account_type) lines.push(`account=${rules.account_type}`)
          if (rules.exclusions) lines.push(`avoids="${String(rules.exclusions).slice(0, 200)}"`)
        }
      } catch (_) { /* silent */ }
      let holding = ''
      try {
        const { data: txns } = await supabaseAdmin
          .from('transactions')
          .select('symbol, transaction_type, shares')
          .eq('user_id', userId)
        const h = holdsSymbol(txns || [], symbol)
        holding = h.held ? `Already HOLDS ${symbol} (${h.shares} shares).` : `Does NOT currently hold ${symbol}.`
      } catch (_) { /* silent */ }
      fitContext = `USER CONTEXT (tailor fitVerdict to this):\nInvestment rules: ${lines.join(', ') || 'not set'}\n${holding}`
    }

    const prompt = buildPrompt({ symbol, company, quote, history, dividends, macroLines, fitContext })

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      throw new Error(`Claude API ${claudeRes.status}: ${errBody.slice(0, 200)}`)
    }
    const claudeData = await claudeRes.json()
    const text = (claudeData.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const parsed = extractJSON(text)

    const rawRating = String(parsed?.fitVerdict?.rating || '').toLowerCase()
    const rating = ['hold', 'research', 'pass'].includes(rawRating) ? rawRating : 'research'

    const dossier = {
      snapshot: String(parsed?.snapshot || '').slice(0, 600),
      bullCase: strArray(parsed?.bullCase),
      bearCase: strArray(parsed?.bearCase),
      dividendProfile: parsed?.dividendProfile ? String(parsed.dividendProfile).slice(0, 400) : null,
      keyRisks: strArray(parsed?.keyRisks),
      fitVerdict: { rating, rationale: String(parsed?.fitVerdict?.rationale || '').slice(0, 400) },
      summary: String(parsed?.summary || '').slice(0, 1200),
    }

    return new Response(JSON.stringify({
      symbol,
      company,
      quote,
      history,
      dividends,
      macro: macroLines,
      dossier,
      personalized: Boolean(userId),
      generatedAt: new Date().toISOString(),
      model: MODEL,
    }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[research-deep-dive] failed:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
