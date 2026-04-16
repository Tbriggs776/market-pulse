// Supabase Edge Function: treasury-data
// Runtime: Deno
//
// Fetches fiscal data from Treasury Fiscal Data API and FRED,
// then generates a Claude fiscal/economic outlook.
//
// Treasury API: no key needed, free, no CORS restrictions
// FRED API: FRED_API_KEY secret
// Claude: ANTHROPIC_API_KEY secret
//
// POST /functions/v1/treasury-data
// Body: {}
// Response: { debt, fiscal, interest, macro, outlook, asOf }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TREASURY_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

// --- Treasury: Total public debt ---
async function fetchDebt() {
  try {
    const url = `${TREASURY_BASE}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=30&fields=record_date,tot_pub_debt_out_amt,intragov_hold_amt,debt_held_public_amt`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null
    return data.data.map((d: Record<string, string>) => ({
      date: d.record_date,
      totalDebt: parseFloat(d.tot_pub_debt_out_amt),
      publicDebt: parseFloat(d.debt_held_public_amt),
      intragovDebt: parseFloat(d.intragov_hold_amt),
    }))
  } catch (err) {
    console.warn('[treasury] debt fetch failed:', err)
    return null
  }
}

// --- Treasury: Monthly receipts and outlays ---
async function fetchFiscalBalance() {
  try {
    const url = `${TREASURY_BASE}/v1/accounting/mts/mts_table_1?sort=-record_date&page[size]=24&fields=record_date,current_month_receipts_amt,current_month_outlays_amt,current_month_deficit_amt,record_fiscal_year,record_calendar_month`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null
    return data.data.map((d: Record<string, string>) => ({
      date: d.record_date,
      fiscalYear: d.record_fiscal_year,
      month: d.record_calendar_month,
      receipts: parseFloat(d.current_month_receipts_amt),
      outlays: parseFloat(d.current_month_outlays_amt),
      deficit: parseFloat(d.current_month_deficit_amt),
    }))
  } catch (err) {
    console.warn('[treasury] fiscal balance fetch failed:', err)
    return null
  }
}

// --- Treasury: Interest expense ---
async function fetchInterestExpense() {
  try {
    const url = `${TREASURY_BASE}/v2/accounting/od/interest_expense?sort=-record_date&page[size]=12&fields=record_date,expense_catg_desc,month_expense_amt,fytd_expense_amt,record_fiscal_year`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null
    // Group by date, sum the total
    const byDate: Record<string, { date: string; monthTotal: number; fytdTotal: number; fiscalYear: string }> = {}
    for (const d of data.data) {
      const key = d.record_date
      if (!byDate[key]) {
        byDate[key] = { date: key, monthTotal: 0, fytdTotal: 0, fiscalYear: d.record_fiscal_year }
      }
      byDate[key].monthTotal += parseFloat(d.month_expense_amt || '0')
      byDate[key].fytdTotal = Math.max(byDate[key].fytdTotal, parseFloat(d.fytd_expense_amt || '0'))
    }
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
  } catch (err) {
    console.warn('[treasury] interest expense fetch failed:', err)
    return null
  }
}

// --- FRED: key macro series ---
async function fetchFredSeries(apiKey: string, seriesId: string) {
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const obs = data.observations || []
    for (const o of obs) {
      if (o.value && o.value !== '.') {
        return { value: parseFloat(o.value), date: o.date }
      }
    }
    return null
  } catch {
    return null
  }
}

async function fetchMacroData(fredKey: string) {
  const series = [
    { id: 'FEDFUNDS', label: 'Fed Funds Rate' },
    { id: 'DGS10', label: '10-Year Treasury Yield' },
    { id: 'DGS2', label: '2-Year Treasury Yield' },
    { id: 'CPIAUCSL', label: 'CPI' },
    { id: 'UNRATE', label: 'Unemployment Rate' },
    { id: 'GDP', label: 'GDP (Billions)' },
    { id: 'GFDEBTN', label: 'Federal Debt (Millions)' },
  ]

  const results = await Promise.all(
    series.map(async (s) => {
      const obs = await fetchFredSeries(fredKey, s.id)
      return { ...s, ...obs }
    }),
  )
  return results
}

// --- Claude: Fiscal & Economic Outlook ---
async function generateOutlook(
  claudeKey: string,
  debt: unknown,
  fiscal: unknown,
  interest: unknown,
  macro: unknown,
) {
  const debtStr = debt
    ? `Latest total public debt: $${((debt as Array<Record<string, number>>)[0]?.totalDebt / 1e12).toFixed(2)} trillion\nDebt held by public: $${((debt as Array<Record<string, number>>)[0]?.publicDebt / 1e12).toFixed(2)} trillion\n30-day trend data points: ${(debt as Array<unknown>).length}`
    : 'Debt data unavailable'

  const fiscalStr = fiscal
    ? (fiscal as Array<Record<string, unknown>>).slice(0, 6).map((f) =>
        `${f.fiscalYear}-${f.month}: Receipts $${((f.receipts as number) / 1e9).toFixed(0)}B, Outlays $${((f.outlays as number) / 1e9).toFixed(0)}B, Deficit $${((f.deficit as number) / 1e9).toFixed(0)}B`
      ).join('\n')
    : 'Fiscal balance data unavailable'

  const interestStr = interest
    ? (interest as Array<Record<string, unknown>>).slice(0, 3).map((i) =>
        `${i.date}: Monthly interest $${((i.monthTotal as number) / 1e9).toFixed(1)}B, FYTD $${((i.fytdTotal as number) / 1e9).toFixed(1)}B`
      ).join('\n')
    : 'Interest expense data unavailable'

  const macroStr = macro
    ? (macro as Array<Record<string, unknown>>).map((m) =>
        `${m.label}: ${m.value ?? 'N/A'} (as of ${m.date ?? 'unknown'})`
      ).join('\n')
    : 'Macro data unavailable'

  const prompt = `You are a senior fiscal policy analyst writing a briefing for a CFO who manages investment portfolios.

Write a 3-4 paragraph "Fiscal & Economic Outlook" that synthesizes the data below. Cover:

1. The current fiscal position: is the deficit widening or narrowing? What does the spending vs revenue trend suggest?
2. The debt burden: total debt level, interest expense trajectory, and what this means for future Treasury issuance and yields
3. Economic context: how do current macro indicators (employment, inflation, rates) interact with the fiscal picture?
4. Investment implications: what should a portfolio manager be thinking about given this fiscal/economic backdrop? Be specific about asset classes and sectors.

Tone: institutional, measured, data-driven. Use specific numbers from the data. No bullet points, no headings, no disclaimers. Write as if briefing a senior partner at a wealth management firm.

DEBT DATA:
${debtStr}

FISCAL BALANCE (recent months):
${fiscalStr}

INTEREST EXPENSE:
${interestStr}

MACRO INDICATORS:
${macroStr}

Begin the outlook now.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: 'You are a senior fiscal policy analyst and macroeconomist. You write concise, data-driven briefings for institutional investors. No ideological lean. Signal over noise.',
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

  const fredKey = Deno.env.get('FRED_API_KEY')
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!fredKey || !claudeKey) {
    return new Response(
      JSON.stringify({ error: 'API keys not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const [debt, fiscal, interest, macro] = await Promise.all([
      fetchDebt(),
      fetchFiscalBalance(),
      fetchInterestExpense(),
      fetchMacroData(fredKey),
    ])

    const outlook = await generateOutlook(claudeKey, debt, fiscal, interest, macro)

    return new Response(
      JSON.stringify({
        debt,
        fiscal,
        interest,
        macro,
        outlook,
        generatedAt: new Date().toISOString(),
        model: CLAUDE_MODEL,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[treasury-data] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})