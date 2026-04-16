// Supabase Edge Function: treasury-statements
// Runtime: Deno
//
// Fetches data for federal financial statements from Treasury APIs.
// All values from DTS are strings representing millions of dollars.
// MTS values are strings representing millions of dollars.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TREASURY_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'

// Parse Treasury string value (in millions) to actual dollar amount
function parseMil(val: unknown): number {
  if (val === null || val === undefined || val === 'null' || val === '') return 0
  const n = parseFloat(String(val))
  return isNaN(n) ? 0 : n * 1e6 // values are in millions
}

// Parse MTS value (already in actual dollars, but as strings)
function parseMts(val: unknown): number {
  if (val === null || val === undefined || val === 'null' || val === '') return 0
  const n = parseFloat(String(val))
  return isNaN(n) ? 0 : n
}

// --- Income Statement: Revenue by source (MTS Table 4) ---
async function fetchRevenueBySource() {
  try {
    const url = `${TREASURY_BASE}/v1/accounting/mts/mts_table_4?sort=-record_date&page[size]=100&fields=record_date,classification_desc,current_month_gross_rcpt_amt,current_fytd_gross_rcpt_amt,prior_fytd_gross_rcpt_amt,record_fiscal_year,record_calendar_month`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null

    const latestDate = data.data[0].record_date
    const latestMonth = data.data.filter((d: Record<string, string>) => d.record_date === latestDate)

    // Filter: only show rows with real data, exclude sub-headers (ending with :)
    // Keep Total rows and meaningful line items
    const meaningful = latestMonth.filter((d: Record<string, string>) => {
      const cat = d.classification_desc || ''
      const fytd = parseMts(d.current_fytd_gross_rcpt_amt)
      // Exclude header rows (end with colon)
      if (cat.endsWith(':')) return false
      // Exclude zero FYTD rows
      if (fytd === 0) return false
      // Exclude adjustment rows
      if (cat.toLowerCase().includes('adjustment')) return false
      return true
    })

    return {
      date: latestDate,
      fiscalYear: data.data[0].record_fiscal_year,
      month: data.data[0].record_calendar_month,
      sources: meaningful.map((d: Record<string, string>) => ({
        category: d.classification_desc,
        monthAmount: parseMts(d.current_month_gross_rcpt_amt),
        fytdAmount: parseMts(d.current_fytd_gross_rcpt_amt),
        priorFytd: parseMts(d.prior_fytd_gross_rcpt_amt),
      })).sort((a: Record<string, number>, b: Record<string, number>) => Math.abs(b.fytdAmount) - Math.abs(a.fytdAmount)),
    }
  } catch (err) {
    console.warn('[treasury-statements] revenue error:', err)
    return null
  }
}

// --- Income Statement: Outlays by category (MTS Table 5) ---
async function fetchOutlaysByCategory() {
  try {
    const url = `${TREASURY_BASE}/v1/accounting/mts/mts_table_5?sort=-record_date&page[size]=100&fields=record_date,classification_desc,current_month_gross_outly_amt,current_fytd_gross_outly_amt,prior_fytd_gross_outly_amt,record_fiscal_year,record_calendar_month`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null

    const latestDate = data.data[0].record_date
    const latestMonth = data.data.filter((d: Record<string, string>) => d.record_date === latestDate)

    const meaningful = latestMonth.filter((d: Record<string, string>) => {
      const cat = d.classification_desc || ''
      const fytd = parseMts(d.current_fytd_gross_outly_amt)
      if (cat.endsWith(':')) return false
      if (fytd === 0) return false
      if (cat.toLowerCase().includes('adjustment')) return false
      return true
    })

    return {
      date: latestDate,
      fiscalYear: data.data[0].record_fiscal_year,
      month: data.data[0].record_calendar_month,
      categories: meaningful.map((d: Record<string, string>) => ({
        category: d.classification_desc,
        monthAmount: parseMts(d.current_month_gross_outly_amt),
        fytdAmount: parseMts(d.current_fytd_gross_outly_amt),
        priorFytd: parseMts(d.prior_fytd_gross_outly_amt),
      })).sort((a: Record<string, number>, b: Record<string, number>) => Math.abs(b.fytdAmount) - Math.abs(a.fytdAmount)),
    }
  } catch (err) {
    console.warn('[treasury-statements] outlays error:', err)
    return null
  }
}

// --- Balance Sheet: DTS operating cash + debt ---
async function fetchBalanceSheet() {
  try {
    // DTS: get latest day's data (4 rows: opening, deposits, withdrawals, closing)
    const dtsUrl = `${TREASURY_BASE}/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=8&fields=record_date,account_type,open_today_bal,close_today_bal`
    const dtsRes = await fetch(dtsUrl)
    let cashBalance = null
    if (dtsRes.ok) {
      const dtsData = await dtsRes.json()
      if (dtsData.data && dtsData.data.length > 0) {
        const latestDate = dtsData.data[0].record_date
        const latest = dtsData.data.filter((d: Record<string, string>) => d.record_date === latestDate)

        // DTS uses open_today_bal for ALL values (close_today_bal is always "null")
        // Values are in millions
        const closing = latest.find((d: Record<string, string>) =>
          d.account_type?.includes('Closing Balance')
        )
        const opening = latest.find((d: Record<string, string>) =>
          d.account_type?.includes('Opening Balance')
        )
        const deposits = latest.find((d: Record<string, string>) =>
          d.account_type?.includes('Deposits')
        )
        const withdrawals = latest.find((d: Record<string, string>) =>
          d.account_type?.includes('Withdrawals')
        )

        cashBalance = {
          date: latestDate,
          closingBalance: parseMil(closing?.open_today_bal),
          openingBalance: parseMil(opening?.open_today_bal),
          totalDeposits: parseMil(deposits?.open_today_bal),
          totalWithdrawals: parseMil(withdrawals?.open_today_bal),
        }
      }
    }

    // Debt data for liabilities side
    const debtUrl = `${TREASURY_BASE}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1&fields=record_date,tot_pub_debt_out_amt,intragov_hold_amt,debt_held_public_amt`
    const debtRes = await fetch(debtUrl)
    let debtData = null
    if (debtRes.ok) {
      const debt = await debtRes.json()
      if (debt.data && debt.data.length > 0) {
        const d = debt.data[0]
        debtData = {
          date: d.record_date,
          totalDebt: parseFloat(d.tot_pub_debt_out_amt),
          publicDebt: parseFloat(d.debt_held_public_amt),
          intragovDebt: parseFloat(d.intragov_hold_amt),
        }
      }
    }

    return { cashBalance, debt: debtData }
  } catch (err) {
    console.warn('[treasury-statements] balance sheet error:', err)
    return { cashBalance: null, debt: null }
  }
}

// --- Cash Flow: DTS deposits and withdrawals summary ---
async function fetchCashFlow() {
  try {
    // Get summary rows from operating_cash_balance (these have the totals)
    const summaryUrl = `${TREASURY_BASE}/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=40&fields=record_date,account_type,open_today_bal`
    const summaryRes = await fetch(summaryUrl)
    let transactions = null
    let cashTrend: Array<Record<string, unknown>> = []

    if (summaryRes.ok) {
      const summaryData = await summaryRes.json()
      if (summaryData.data && summaryData.data.length > 0) {
        const latestDate = summaryData.data[0].record_date
        const latest = summaryData.data.filter((d: Record<string, string>) => d.record_date === latestDate)

        const getValue = (keyword: string) => {
          const row = latest.find((d: Record<string, string>) => d.account_type?.includes(keyword))
          return parseMil(row?.open_today_bal)
        }

        transactions = {
          date: latestDate,
          openingBalance: getValue('Opening Balance'),
          closingBalance: getValue('Closing Balance'),
          todayDeposits: getValue('Deposits'),
          todayWithdrawals: getValue('Withdrawals'),
          netChange: getValue('Closing Balance') - getValue('Opening Balance'),
        }

        // Build cash trend from closing balances across days
        const allDates = [...new Set(summaryData.data.map((d: Record<string, string>) => d.record_date))]
        cashTrend = allDates.map((date) => {
          const dayRows = summaryData.data.filter((d: Record<string, string>) => d.record_date === date)
          const closingRow = dayRows.find((d: Record<string, string>) => d.account_type?.includes('Closing Balance'))
          return {
            date,
            balance: parseMil(closingRow?.open_today_bal),
          }
        }).filter((d: Record<string, unknown>) => (d.balance as number) > 0)
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.date as string).localeCompare(b.date as string))
      }
    }

    return { transactions, cashTrend }
  } catch (err) {
    console.warn('[treasury-statements] cash flow error:', err)
    return { transactions: null, cashTrend: [] }
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

  let body: { statement?: string }
  try { body = await req.json() } catch { body = {} }

  const statement = body.statement || 'all'

  try {
    if (statement === 'income') {
      const [revenue, outlays] = await Promise.all([fetchRevenueBySource(), fetchOutlaysByCategory()])
      return new Response(
        JSON.stringify({ revenue, outlays, asOf: new Date().toISOString() }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    if (statement === 'balance_sheet') {
      const bs = await fetchBalanceSheet()
      return new Response(
        JSON.stringify({ ...bs, asOf: new Date().toISOString() }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    if (statement === 'cash_flow') {
      const cf = await fetchCashFlow()
      return new Response(
        JSON.stringify({ ...cf, asOf: new Date().toISOString() }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const [revenue, outlays, balanceSheet, cashFlow] = await Promise.all([
      fetchRevenueBySource(), fetchOutlaysByCategory(), fetchBalanceSheet(), fetchCashFlow(),
    ])

    return new Response(
      JSON.stringify({ revenue, outlays, balanceSheet, cashFlow, asOf: new Date().toISOString() }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[treasury-statements] failed:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})