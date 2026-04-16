import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const USA_SPENDING_BASE = 'https://api.usaspending.gov/api/v2'

async function fetchTopAgencies() {
  try {
    const url = `${USA_SPENDING_BASE}/references/toptier_agencies/`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || [])
      .filter((a: Record<string, unknown>) => (a.outlay_amount as number) > 1000000)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((b.outlay_amount as number) || 0) - ((a.outlay_amount as number) || 0)
      )
      .slice(0, 25)
      .map((a: Record<string, unknown>) => ({
        name: a.agency_name,
        abbreviation: a.abbreviation,
        toptierCode: a.toptier_code,
        agencyId: a.agency_id,
        obligated: a.obligated_amount,
        outlays: a.outlay_amount,
        budget: a.budget_authority_amount,
        percentage: a.percentage_of_total_budget_authority,
        slug: a.agency_slug,
        fiscalYear: a.active_fy,
      }))
  } catch (err) {
    console.warn('[spending] agencies error:', err)
    return []
  }
}

async function fetchBudgetFunctions() {
  // Try FY2025 Q4 first, then Q3, Q2, Q1
  const quarters = ['4', '3', '2', '1']
  for (const q of quarters) {
    try {
      const url = `${USA_SPENDING_BASE}/spending/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'budget_function',
          filters: { fy: '2025', quarter: q },
        }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const results = data.results || []
      if (results.length > 0) {
        return {
          total: data.total || 0,
          endDate: data.end_date || null,
          items: results
            .filter((b: Record<string, unknown>) => (b.amount as number) > 0)
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
              ((b.amount as number) || 0) - ((a.amount as number) || 0)
            ),
        }
      }
    } catch {
      continue
    }
  }
  return { total: 0, endDate: null, items: [] }
}

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

  let body: { type?: string }
  try { body = await req.json() } catch { body = {} }

  const type = body.type || 'all'

  try {
    if (type === 'agencies') {
      const agencies = await fetchTopAgencies()
      return new Response(
        JSON.stringify({ agencies, asOf: new Date().toISOString() }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    if (type === 'budget_functions') {
      const bf = await fetchBudgetFunctions()
      return new Response(
        JSON.stringify({ budgetFunctions: bf.items, totalSpending: bf.total, endDate: bf.endDate, asOf: new Date().toISOString() }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const [agencies, bf] = await Promise.all([
      fetchTopAgencies(),
      fetchBudgetFunctions(),
    ])

    return new Response(
      JSON.stringify({
        agencies,
        budgetFunctions: bf.items,
        totalSpending: bf.total,
        endDate: bf.endDate,
        fiscalYear: agencies.length > 0 ? agencies[0].fiscalYear : '2026',
        asOf: new Date().toISOString(),
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[spending-data] failed:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})