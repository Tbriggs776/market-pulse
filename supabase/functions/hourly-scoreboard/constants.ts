// hourly-scoreboard constants
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
export const POLYGON_BASE = 'https://api.polygon.io'
export const NEWSDATA_BASE = 'https://newsdata.io/api/1'

export const FRED_SERIES = [
  { id: 'DGS10', label: '10-Year Treasury', unit: '%' },
  { id: 'DGS2', label: '2-Year Treasury', unit: '%' },
  { id: 'T10Y2Y', label: '10Y–2Y Spread', unit: 'pp' },
]

export const RISK_SYMBOLS = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
  { symbol: 'TLT', label: '20+ Year Treasury (TLT)' },
  { symbol: 'HYG', label: 'High Yield Corp (HYG)' },
  { symbol: 'GLD', label: 'Gold (GLD)' },
  { symbol: 'USO', label: 'Crude Oil (USO)' },
  { symbol: 'UUP', label: 'US Dollar (UUP)' },
  { symbol: 'VIXY', label: 'Short-Term VIX (VIXY)' },
]

export const GEO_KEYWORDS: Array<{ term: string; weight: number }> = [
  { term: 'fed', weight: 2 },
  { term: 'fomc', weight: 3 },
  { term: 'powell', weight: 2 },
  { term: 'rate hike', weight: 3 },
  { term: 'rate cut', weight: 3 },
  { term: 'yield', weight: 1 },
  { term: 'treasury', weight: 1 },
  { term: 'war', weight: 2 },
  { term: 'iran', weight: 2 },
  { term: 'israel', weight: 2 },
  { term: 'ukraine', weight: 2 },
  { term: 'gaza', weight: 2 },
  { term: 'oil', weight: 1 },
  { term: 'opec', weight: 2 },
  { term: 'tariff', weight: 2 },
  { term: 'sanction', weight: 2 },
  { term: 'ceasefire', weight: 2 },
  { term: 'missile', weight: 2 },
  { term: 'strike', weight: 1 },
  { term: 'invasion', weight: 3 },
]

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export interface RiskLine {
  symbol: string
  label: string
  price: number | null
  change1hPct: number | null
  changeSessionPct: number | null
  asOf: string
}

export interface GeoItem {
  title: string
  source: string
  url: string
  score: number
  reason: string
}
