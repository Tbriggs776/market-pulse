// Supabase Edge Function: treasury-statements
// Runtime: Deno
//
// Fetches data for the three federal financial statements:
// Income Statement (revenue by source + expenses)
// Balance Sheet (assets vs liabilities)
// Cash Flow (Daily Treasury Statement)
//
// Treasury Fiscal Data API: free, no key needed
//
// POST /functions/v1/treasury-statements
// Body: { statement: "income" | "balance_sheet" | "cash_flow" | "all" }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TREASURY_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'

// --- Income Statement: Revenue by source ---
async function fetchRevenueBySource() {
  try {
    // MTS Table 4: receipts by source
    const url = `${TREASURY_BASE}/v1/accounting/mts/mts_table_4?sort=-record_date&page[size]=50&fields=record_date,classification_desc,current_month_gross_rcpt_amt,current_fytd_gross_rcpt_amt,prior_fytd_gross_rcpt_amt,record_fiscal_year,record_calendar_month`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[treasury-statements] revenue: ${res.status}`)
      return null
    }
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null

    // Get the latest month's data
    const latestDate = data.data[0].record_date
    const latestMonth = data.data.filter((d: Record<string, string>) => d.record_date === latestDate)

    return {
      date: latestDate,
      fiscalYear: data.data[0].record_fiscal_year,
      month: data.data[0].record_calendar_month,
      sources: latestMonth.map((d: Record<string, string>) => ({
        category: d.classification_desc,
        monthAmount: parseFloat(d.current_month_gross_rcpt_amt || '0'),
        fytdAmount: parseFloat(d.current_fytd_gross_rcpt_amt || '0'),
        priorFytd: parseFloat(d.prior_fytd_gross_rcpt_amt || '0'),
      })).filter((s: Record<string, unknown>) => s.category && s.fytdAmount !== 0)
        .sort((a: Record<string, number>, b: Record<string, number>) => b.fytdAmount - a.fytdAmount),
    }
  } catch (err) {
    console.warn('[treasury-statements] revenue error:', err)
    return null
  }
}

// --- Income Statement: Outlays by category ---
async function fetchOutlaysByCategory() {
  try {
    const url = `${TREASURY_BASE}/v1/accounting/mts/mts_table_5?sort=-record_date&page[size]=50&fields=record_date,classification_desc,current_month_gross_outly_amt,current_fytd_gross_outly_amt,prior_fytd_gross_outly_amt,record_fiscal_year,record_calendar_month`
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[treasury-statements] outlays: ${res.status}`)
      return null
    }
    const data = await res.json()
    if (!data.data || data.data.length === 0) return null

    const latestDate = data.data[0].record_date
    const latestMonth = data.data.filter((d: Record<string, string>) => d.record_date === latestDate)

    return {
      date: latestDate,
      fiscalYear: data.data[0].record_fiscal_year,
      month: data.data[0].record_calendar_month,
      categories: latestMonth.map((d: Record<string, string>) => ({
        category: d.classification_desc,
        monthAmount: parseFloat(d.current_month_gross_outly_amt || '0'),
        fytdAmount: parseFloat(d.current_fytd_gross_outly_amt || '0'),
        priorFytd: parseFloat(d.prior_fytd_gross_outly_amt || '0'),
      })).filter((s: Record<string, unknown>) => s.category && s.fytdAmount !== 0)
        .sort((a: Record<string, number>, b: Record<string, number>) => b.fytdAmount - a.fytdAmount),
    }
  } catch (err) {
    console.warn('[treasury-statements] outlays error:', err)
    return null
  }
}

// --- Balance Sheet: Operating cash + debt components ---
async function fetchBalanceSheet() {
  try {
    // Daily Treasury Statement: operating cash balance
    const dtsUrl = `${TREASURY_BASE}/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=5&fields=record_date,account_type,open_today_bal,close_today_bal`
    const dtsRes = await fetch(dtsUrl)
    let cashBalance = null
    if (dtsRes.ok) {
      const dtsData = await dtsRes.json()
      if (dtsData.data && dtsData.data.length > 0) {
        // Find Federal Reserve Account balance
        const latestDate = dtsData.data[0].record_date
        const latestEntries = dtsData.data.filter((d: Record<string, string>) => d.record_date === latestDate)
        const totalEntry = latestEntries.find((d: Record<string, string>) =>
          d.account_type?.toLowerCase().includes('federal reserve')
        ) || latestEntries[0]
        cashBalance = {
          date: latestDate,
          openBalance: parseFloat(totalEntry?.open_today_bal || '0'),
          closeBalance: parseFloat(totalEntry?.close_today_bal || '0'),
          entries: latestEntries.map((d: Record<string, string>) => ({
            type: d.account_type,
            open: parseFloat(d.open_today_bal || '0'),
            close: parseFloat(d.close_today_bal || '0'),
          })),
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

// --- Cash Flow: DTS deposits and withdrawals ---
async function fetchCashFlow() {
  try {
    // Deposits (receipts into Treasury)
    const depUrl = `${TREASURY_BASE}/v1/accounting/dts/deposits_withdrawals_operating_cash?sort=-record_date&page[size]=60&fields=record_date,account_type,transaction_type,transaction_today_amt,transaction_mtd_amt,transaction_fytd_amt`
    const depRes = await fetch(depUrl)
    let transactions = null
    if (depRes.ok) {
      const depData = await depRes.json()
      if (depData.data && depData.data.length > 0) {
        const latestDate = depData.data[0].record_date
        const latest = depData.data.filter((d: Record<string, string>) => d.record_date === latestDate)

        const deposits = latest.filter((d: Record<string, string>) =>
          d.transaction_type?.toLowerCase().includes('deposit')
        )
        const withdrawals = latest.filter((d: Record<string, string>) =>
          d.transaction_type?.toLowerCase().includes('withdrawal')
        )

        const sumField = (arr: Array<Record<string, string>>, field: string) =>
          arr.reduce((sum, d) => sum + parseFloat(d[field] || '0'), 0)

        transactions = {
          date: latestDate,
          todayDeposits: sumField(deposits, 'transaction_today_amt'),
          todayWithdrawals: sumField(withdrawals, 'transaction_today_amt'),
          mtdDeposits: sumField(deposits, 'transaction_mtd_amt'),
          mtdWithdrawals: sumField(withdrawals, 'transaction_mtd_amt'),
          fytdDeposits: sumField(deposits, 'transaction_fytd_amt'),
          fytdWithdrawals: sumField(withdrawals, 'transaction_fytd_amt'),
          details: latest.slice(0, 20).map((d: Record<string, string>) => ({
            type: d.account_type,
            transactionType: d.transaction_type,
            today: parseFloat(d.transaction_today_amt || '0'),
            mtd: parseFloat(d.transaction_mtd_amt || '0'),
            fytd: parseFloat(d.transaction_fytd_amt || '0'),
          })),
        }
      }
    }

    // Operating cash trend (last 30 days)
    const trendUrl = `${TREASURY_BASE}/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=30&fields=record_date,account_type,close_today_bal`
    const trendRes = await fetch(trendUrl)
    let cashTrend: Array<Record<string, unknown>> = []
    if (trendRes.ok) {
      const trendData = await trendRes.json()
      if (trendData.data) {
        // Group by date, sum close balances
        const byDate: Record<string, number> = {}
        for (const d of trendData.data) {
          if (!byDate[d.record_date]) byDate[d.record_date] = 0
          byDate[d.record_date] += parseFloat(d.close_today_bal || '0')
        }
        cashTrend = Object.entries(byDate)
          .map(([date, balance]) => ({ date, balance }))
          .sort((a, b) => a.date.localeCompare(b.date))
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
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const statement = body.statement || 'all'

  try {
    if (statement === 'income') {
      const [revenue, outlays] = await Promise.all([
        fetchRevenueBySource(),
        fetchOutlaysByCategory(),
      ])
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

    // All statements
    const [revenue, outlays, balanceSheet, cashFlow] = await Promise.all([
      fetchRevenueBySource(),
      fetchOutlaysByCategory(),
      fetchBalanceSheet(),
      fetchCashFlow(),
    ])

    return new Response(
      JSON.stringify({
        revenue,
        outlays,
        balanceSheet,
        cashFlow,
        asOf: new Date().toISOString(),
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[treasury-statements] failed:', err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})