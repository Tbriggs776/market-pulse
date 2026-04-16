import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const USA_SPENDING_BASE = 'https://api.usaspending.gov/api/v2'

// Toptier agencies - GET endpoint, returns all agencies with spending data
async function fetchTopAgencies() {
  try {
    const url = `${USA_SPENDING_BASE}/references/toptier_agencies/`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[spending] toptier_agencies: ${res.status}`)
      return []
    }
    const data = await res.json()
    const results = data.results || []
    // Filter to agencies with meaningful spending, sort by outlays
    return results
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

// Budget function spending - POST endpoint
async function fetchBudgetFunctions() {
  try {
    const url = `${USA_SPENDING_BASE}/spending/`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'budget_function',
        filters: { fy: '2025' },
      }),
    })
    if (!res.ok) {
      console.warn(`[spending] budget_function: ${res.status}`)
      // Try without filters
      const res2 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'budget_function' }),
      })
      if (!res2.ok) return []
      const data2 = await res2.json()
      return (data2.results || [])
        .filter((b: Record<string, unknown>) => (b.amount as number) > 0)
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b.amount as number) || 0) - ((a.amount as number) || 0)
        )
    }
    const data = await res.json()
    return (data.results || [])
      .filter((b: Record<string, unknown>) => (b.amount as number) > 0)
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((b.amount as number) || 0) - ((a.amount as number) || 0)
      )
  } catch (err) {
    console.warn('[spending] budget functions error:', err)
    return []
  }
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
  try {
    body = await req.json()
  } catch {
    body = {}
  }

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
      const budgetFunctions = await fetchBudgetFunctions()
      return new Response(
        JSON.stringify({ budgetFunctions, asOf: new Date().toISOString() }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // All
    const [agencies, budgetFunctions] = await Promise.all([
      fetchTopAgencies(),
      fetchBudgetFunctions(),
    ])

    return new Response(
      JSON.stringify({
        agencies,
        budgetFunctions,
        fiscalYear: agencies.length > 0 ? agencies[0].fiscalYear : '2026',
        asOf: new Date().toISOString(),
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[spending-data] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})