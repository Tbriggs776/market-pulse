import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const USA_SPENDING_BASE = 'https://api.usaspending.gov/api/v2'
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''

async function fetchSubAgencies(toptierCode: string, fiscalYear: number) {
  const allResults: Array<Record<string, unknown>> = []
  let page = 1
  while (page <= 5) {
    try {
      const url = `${USA_SPENDING_BASE}/agency/${toptierCode}/sub_agency/?fiscal_year=${fiscalYear}&page=${page}&limit=10`
      const res = await fetch(url)
      if (!res.ok) break
      const data = await res.json()
      const results = data.results || []
      if (results.length === 0) break
      for (const sub of results) {
        let topOffices: Array<Record<string, unknown>> = []
        if (Array.isArray(sub.children)) {
          topOffices = sub.children
            .map((c: Record<string, unknown>) => ({ name: c.name, code: c.code, obligations: c.total_obligations || 0 }))
            .filter((c: Record<string, unknown>) => (c.obligations as number) > 0)
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.obligations as number) - (a.obligations as number))
            .slice(0, 5)
        }
        allResults.push({
          name: sub.name || 'Unknown',
          abbreviation: sub.abbreviation || '',
          obligations: sub.total_obligations || 0,
          transactionCount: sub.transaction_count || 0,
          newAwardCount: sub.new_award_count || 0,
          topOffices,
        })
      }
      if (!data.page_metadata?.hasNext) break
      page++
    } catch (err) { console.warn('[agency-detail] page error:', err); break }
  }
  return allResults.filter((s) => (s.obligations as number) > 0).sort((a, b) => (b.obligations as number) - (a.obligations as number))
}

async function generateGrade(agencyName: string, abbreviation: string, budget: number, obligated: number, outlays: number, subAgencies: Array<Record<string, unknown>>) {
  if (!ANTHROPIC_API_KEY) return { grade: 'N/A', assessment: 'API key not configured.' }
  const obligationRate = budget > 0 ? ((obligated / budget) * 100).toFixed(1) : 'N/A'
  const outlayRate = obligated > 0 ? ((outlays / obligated) * 100).toFixed(1) : 'N/A'
  const topSubs = subAgencies.slice(0, 5).map((s) => `${s.name} (${s.abbreviation}): $${((s.obligations as number) / 1e9).toFixed(1)}B`).join(', ')
  const prompt = `You are a senior federal budget analyst grading agency fiscal performance for FY2026 Q2.\n\nAgency: ${agencyName} (${abbreviation})\nBudget Authority: $${(budget / 1e9).toFixed(1)}B\nObligations: $${(obligated / 1e9).toFixed(1)}B (${obligationRate}% of budget)\nOutlays: $${(outlays / 1e9).toFixed(1)}B (${outlayRate}% of obligations)\nTop Sub-Agencies: ${topSubs}\n\nGrade A-F on fiscal execution at this point in the fiscal year (Q2, ~50% obligation rate is on track). Consider obligation rate, outlay efficiency, mission context, sub-agency distribution.\n\nRespond exactly:\nGRADE: [A/B/C/D/F]\nASSESSMENT: [2-3 sentences for a CFO. Be direct and specific.]`
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return { grade: 'N/A', assessment: 'Assessment unavailable.' }
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const gradeMatch = text.match(/GRADE:\s*([A-F][+-]?)/)
    const assessMatch = text.match(/ASSESSMENT:\s*(.+)/s)
    return { grade: gradeMatch?.[1] || 'N/A', assessment: assessMatch?.[1]?.trim() || text.trim() }
  } catch (err) { console.warn('[agency-detail] Claude error:', err); return { grade: 'N/A', assessment: 'Assessment unavailable.' } }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { body = {} }
  const toptierCode = body.toptierCode as string
  if (!toptierCode) return new Response(JSON.stringify({ error: 'toptierCode required' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  const fiscalYear = (body.fiscalYear as number) || new Date().getFullYear()
  try {
    const subAgencies = await fetchSubAgencies(toptierCode, fiscalYear)
    const { grade, assessment } = await generateGrade(body.agencyName as string || '', body.abbreviation as string || '', body.budget as number || 0, body.obligated as number || 0, body.outlays as number || 0, subAgencies)
    return new Response(JSON.stringify({ toptierCode, subAgencies, grade, assessment, fiscalYear, asOf: new Date().toISOString() }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
})