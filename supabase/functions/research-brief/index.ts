// Supabase Edge Function: research-brief
// Runtime: Deno
//
// Given a ticker symbol, fetches company details + price history
// from Polygon, then calls Claude Haiku to generate an investment
// thesis. Returns everything the frontend needs for a one-page
// research dossier.
//
// Secrets: MASSIVE_API_KEY, ANTHROPIC_API_KEY
//
// POST /functions/v1/research-brief
// Body: { symbol: "AAPL" }
// Response: { company, quote, history, thesis }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

// --- Polygon: company details ---
async function fetchCompany(apiKey: string, symbol: string) {
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results) return null
    const r = data.results
    return {
      name: r.name || symbol,
      description: r.description || '',
      sector: r.sic_description || '',
      industry: r.type || '',
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
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results || data.results.length === 0) return null
    const r = data.results[0]
    const change = r.c - r.o
    const changePercent = r.o > 0 ? (change / r.o) * 100 : 0
    return {
      price: r.c,
      open: r.o,
      high: r.h,
      low: r.l,
      volume: r.v,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
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
    from.setDate(from.getDate() - 45) // 45 days to account for weekends/holidays
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

// --- Claude: investment thesis ---
async function generateThesis(
  claudeKey: string,
  symbol: string,
  company: Record<string, unknown> | null,
  quote: Record<string, unknown> | null,
  history: Array<Record<string, unknown>>,
) {
  const companyInfo = company
    ? `Company: ${company.name}\nSector: ${company.sector}\nDescription: ${company.description}\nMarket Cap: ${company.marketCap ? '$' + (Number(company.marketCap) / 1e9).toFixed(1) + 'B' : 'Unknown'}\nEmployees: ${company.totalEmployees || 'Unknown'}\nListed: ${company.listDate || 'Unknown'}`
    : `Company: ${symbol} (no detailed info available)`

  const quoteInfo = quote
    ? `Current Price: $${quote.price}\nDay Change: ${quote.changePercent}%\nOpen: $${quote.open}, High: $${quote.high}, Low: $${quote.low}`
    : 'Current quote unavailable'

  const historyInfo = history.length > 0
    ? `30-day range: $${Math.min(...history.map((h) => h.close as number)).toFixed(2)} - $${Math.max(...history.map((h) => h.close as number)).toFixed(2)}\n30-day data points: ${history.length}`
    : 'No recent price history available'

  const prompt = `You are a senior research analyst writing an investment brief for a CFO who manages dividend-income portfolios for high-net-worth clients.

Write a 2-3 paragraph investment thesis for ${symbol}. Cover:

1. Company overview and what they actually do (be specific, not generic)
2. Recent performance context — what the price action and fundamentals suggest
3. Bull case and bear case — one sentence each
4. Relevance to a dividend-income or conservative growth portfolio — is this a hold, a research candidate, or a pass? Why?

Tone: institutional, measured, specific. Use numbers when available. No bullet points, no headings, no disclaimers. Write as if briefing a senior partner.

DATA:
${companyInfo}

${quoteInfo}

${historyInfo}

Begin the thesis now.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: 'You are a senior equity research analyst at an institutional investment firm. You write concise, specific investment briefs for CFOs and portfolio managers. No ideological lean. Signal over noise.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Claude API returned ${response.status}: ${errBody.slice(0, 200)}`)
  }

  const data = await response.json()
  const textBlocks = (data.content || []).filter(
    (block: { type: string }) => block.type === 'text',
  )
  return textBlocks.map((b: { text: string }) => b.text).join('\n\n').trim()
}

// --- Handler ---
serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const polygonKey = Deno.env.get('MASSIVE_API_KEY')
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!polygonKey || !claudeKey) {
    return new Response(
      JSON.stringify({ error: 'API keys not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  let body: { symbol?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const symbol = (body.symbol || '').toUpperCase().trim()
  if (!symbol) {
    return new Response(
      JSON.stringify({ error: 'symbol is required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Fetch company, quote, and history in parallel
    const [company, quote, history] = await Promise.all([
      fetchCompany(polygonKey, symbol),
      fetchQuote(polygonKey, symbol),
      fetchHistory(polygonKey, symbol),
    ])

    if (!company && !quote) {
      return new Response(
        JSON.stringify({ error: `Could not find data for ${symbol}` }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Generate thesis
    const thesis = await generateThesis(claudeKey, symbol, company, quote, history)

    return new Response(
      JSON.stringify({
        symbol,
        company,
        quote,
        history,
        thesis,
        generatedAt: new Date().toISOString(),
        model: CLAUDE_MODEL,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[research-brief] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})