// Supabase Edge Function: asset-metadata
// Runtime: Deno
//
// Returns ticker metadata (sector, industry, type) for a list of symbols.
// Maps Polygon SIC codes to GICS-ish sectors for portfolio analytics.
//
// Secrets required: MASSIVE_API_KEY
//
// POST /functions/v1/asset-metadata
// Body: { symbols: ["AAPL", "VOO", ...] }
// Response: { metadata: { AAPL: { sector, industry, type, name }, ... } }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Metadata {
  symbol: string
  name: string
  sector: string
  industry: string
  type: string
}

// SIC code -> GICS-ish sector. Deliberately coarse; unknown codes fall through
// to "Other" rather than mis-classifying. Expand ranges as gaps surface.
function classifySector(sicCode: string | undefined, tickerType: string): string {
  // Fund-style instruments don't get an operating sector.
  if (tickerType === 'ETF' || tickerType === 'ETV' || tickerType === 'ETN') return 'ETF / Fund'
  if (tickerType === 'FUND' || tickerType === 'MF') return 'ETF / Fund'

  if (!sicCode) return 'Uncategorized'
  const code = parseInt(sicCode, 10)
  if (!Number.isFinite(code)) return 'Uncategorized'

  // Software, computer services, analytical instruments
  if ((code >= 7370 && code <= 7379) || code === 3827) return 'Technology'
  // Semiconductors, computer hardware
  if ((code >= 3670 && code <= 3679) || (code >= 3570 && code <= 3579)) return 'Technology'

  // Pharma & biotech
  if ((code >= 2830 && code <= 2836) || (code >= 8730 && code <= 8734)) return 'Health Care'
  // Medical devices & services
  if ((code >= 3840 && code <= 3851) || (code >= 8000 && code <= 8099)) return 'Health Care'

  // Real Estate (checked before Financials so REITs don't fall into Financials)
  if (code >= 6500 && code <= 6599) return 'Real Estate'
  if (code >= 6000 && code <= 6799) return 'Financials'

  // Energy
  if ((code >= 1300 && code <= 1389) || (code >= 2900 && code <= 2999)) return 'Energy'
  // Utilities
  if (code >= 4900 && code <= 4999) return 'Utilities'

  // Communication Services
  if (code >= 4800 && code <= 4899) return 'Communication Services'
  if ((code >= 2710 && code <= 2741) || (code >= 7810 && code <= 7829)) return 'Communication Services'

  // Materials
  if ((code >= 1000 && code <= 1499) || (code >= 2400 && code <= 2799) ||
      (code >= 2800 && code <= 2899) || (code >= 3000 && code <= 3399)) return 'Materials'

  // Consumer Staples
  if ((code >= 2000 && code <= 2199) || (code >= 5140 && code <= 5199) ||
      (code >= 5400 && code <= 5499)) return 'Consumer Staples'

  // Industrials
  if ((code >= 1500 && code <= 1799) || (code >= 3400 && code <= 3569) ||
      (code >= 3580 && code <= 3669) || (code >= 3700 && code <= 3799) ||
      (code >= 4000 && code <= 4799)) return 'Industrials'

  // Consumer Discretionary
  if ((code >= 5000 && code <= 5999) || (code >= 7000 && code <= 7389) ||
      (code >= 7800 && code <= 7999)) return 'Consumer Discretionary'

  return 'Other'
}

// Clean Polygon's SIC description: "SERVICES-PREPACKAGED SOFTWARE" -> "Prepackaged Software".
function cleanIndustry(sicDescription: string): string {
  if (!sicDescription) return ''
  const parts = sicDescription.split('-')
  const meaningful = parts.length > 1 ? parts.slice(1).join('-') : parts[0]
  return meaningful.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

async function fetchOne(
  apiKey: string,
  symbol: string,
): Promise<[string, Metadata | null]> {
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${symbol.toUpperCase()}?apiKey=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[asset-metadata] ${symbol}: ${res.status}`)
      return [symbol, null]
    }
    const data = await res.json()
    const r = data?.results
    if (!r) return [symbol, null]
    const tickerType: string = r.type || ''
    return [symbol, {
      symbol: symbol.toUpperCase(),
      name: r.name || symbol,
      sector: classifySector(r.sic_code, tickerType),
      industry: cleanIndustry(r.sic_description || ''),
      type: tickerType,
    }]
  } catch (err) {
    console.warn(`[asset-metadata] ${symbol} error:`, err)
    return [symbol, null]
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

  const apiKey = Deno.env.get('MASSIVE_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'MASSIVE_API_KEY not configured' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  let body: { symbols?: string[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const symbols = body.symbols || []
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return new Response(
      JSON.stringify({ error: 'symbols array is required' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const capped = symbols.slice(0, 20)
  try {
    const results = await Promise.allSettled(
      capped.map((s) => fetchOne(apiKey, s)),
    )
    const metadata: Record<string, Metadata> = {}
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [sym, meta] = result.value
        if (meta) metadata[sym.toUpperCase()] = meta
      }
    }
    return new Response(JSON.stringify({ metadata }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[asset-metadata] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
