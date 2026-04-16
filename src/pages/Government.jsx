import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Landmark, TrendingUp, TrendingDown, RefreshCw, AlertTriangle,
  Sparkles, DollarSign, Scale, CreditCard, BarChart3,
  LayoutDashboard, PiggyBank, Building2, FileSpreadsheet,
  ArrowUpRight, ArrowDownRight, Receipt, Wallet, Banknote
} from 'lucide-react'
import { treasuryService, spendingService, statementsService } from '../lib/api'

const GOV_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'statements', label: 'Financial Statements', icon: FileSpreadsheet },
  { id: 'spending', label: 'Spending', icon: PiggyBank },
  { id: 'departments', label: 'Departments', icon: Building2 },
]

const STMT_SUB_TABS = [
  { id: 'income', label: 'Income Statement', icon: Receipt },
  { id: 'balance', label: 'Balance Sheet', icon: Wallet },
  { id: 'cashflow', label: 'Cash Flow', icon: Banknote },
]

export default function Government() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Government & Fiscal
          </h1>
          <p className="text-sm text-text-secondary">
            Federal financial statements, spending analysis, and fiscal outlook
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-surface rounded-md border border-border" role="tablist">
          {GOV_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === tab.id ? 'bg-gold/15 text-gold-bright' : 'text-text-secondary hover:text-ivory'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && <GovDashboard />}
      {activeTab === 'statements' && <FinancialStatements />}
      {activeTab === 'spending' && <SpendingTab />}
      {activeTab === 'departments' && <DepartmentsTab />}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════

function trillions(n) { if (n == null) return '--'; return '$' + (n / 1e12).toFixed(2) + 'T' }
function billions(n) { if (n == null) return '--'; if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'; return '$' + (n / 1e9).toFixed(1) + 'B' }
function millions(n) { if (n == null) return '--'; if (Math.abs(n) >= 1e9) return billions(n); return '$' + (n / 1e6).toFixed(0) + 'M' }
function fmtPct(n) { if (n == null) return '--'; return (n >= 0 ? '+' : '') + n.toFixed(1) + '%' }

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="card animate-pulse"><div className="h-3 bg-surface-elevated rounded w-20 mb-3" /><div className="h-8 bg-surface-elevated rounded w-32" /></div>)}
      </div>
    </div>
  )
}

function ErrorCard({ message }) {
  return <div className="card border-crimson/30"><div className="flex items-center gap-2 text-crimson text-sm"><AlertTriangle className="w-4 h-4 shrink-0" />{message || 'Failed to load data'}</div></div>
}

// ════════════════════════════════════════════════════
// Dashboard Tab
// ════════════════════════════════════════════════════

function GovDashboard() {
  const { data: fiscal, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['treasury-data'],
    queryFn: treasuryService.getFiscalOverview,
    staleTime: 30 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000, refetchOnWindowFocus: false,
  })

  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorCard message={error.message} />

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {fiscal?.debt && fiscal.debt.length > 0 && fiscal?.fiscal && fiscal.fiscal.length > 0 && fiscal?.interest && fiscal.interest.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated">
            <div className="text-xs text-text-muted mb-1">Total National Debt</div>
            <div className="font-mono text-xl text-ivory">{trillions(fiscal.debt[0].totalDebt)}</div>
            <div className="text-[10px] text-text-muted mt-1">as of {fiscal.debt[0].date}</div>
          </div>
          <div className="card-elevated">
            <div className="text-xs text-text-muted mb-1">Latest Monthly Deficit</div>
            <div className={`font-mono text-xl ${fiscal.fiscal[0].deficit < 0 ? 'text-crimson' : 'text-positive'}`}>{billions(Math.abs(fiscal.fiscal[0].deficit))}</div>
            <div className="text-[10px] text-text-muted mt-1">{fiscal.fiscal[0].deficit < 0 ? 'Deficit' : 'Surplus'} - FY{fiscal.fiscal[0].fiscalYear} M{fiscal.fiscal[0].month}</div>
          </div>
          <div className="card-elevated">
            <div className="text-xs text-text-muted mb-1">Monthly Interest Cost</div>
            <div className="font-mono text-xl text-crimson">{billions(fiscal.interest[0].monthTotal)}</div>
            <div className="text-[10px] text-text-muted mt-1">{fiscal.interest[0].date}</div>
          </div>
          <div className="card-elevated">
            <div className="text-xs text-text-muted mb-1">FYTD Interest</div>
            <div className="font-mono text-xl text-crimson">{billions(fiscal.interest[0].fytdTotal)}</div>
            <div className="text-[10px] text-text-muted mt-1">FY{fiscal.interest[0].fiscalYear}</div>
          </div>
        </div>
      )}
      {fiscal?.outlook && (
        <div className="card-elevated border-gold/20">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-gold" />
            <span className="text-xs font-medium text-gold uppercase tracking-wide">Fiscal & Economic Outlook</span>
          </div>
          <div className="prose-briefing text-sm">
            {fiscal.outlook.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
            <span>Generated {fiscal.generatedAt ? new Date(fiscal.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</span>
            <span className="font-mono">{fiscal.model}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Financial Statements Tab (with sub-navigation)
// ════════════════════════════════════════════════════

function FinancialStatements() {
  const [subTab, setSubTab] = useState('income')

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        {STMT_SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              subTab === tab.id
                ? 'bg-gold/15 text-gold-bright border border-gold/30'
                : 'text-text-secondary hover:text-ivory hover:bg-surface'
            }`}
          >
            <tab.icon className="w-4 h-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'income' && <IncomeStatement />}
      {subTab === 'balance' && <BalanceSheet />}
      {subTab === 'cashflow' && <CashFlowStatement />}
    </div>
  )
}

// --- Income Statement ---
function IncomeStatement() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['treasury-statements', 'income'],
    queryFn: statementsService.getIncomeStatement,
    staleTime: 30 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000, refetchOnWindowFocus: false,
  })

  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorCard message={error.message} />

  const totalRevenue = data?.revenue?.sources?.reduce((s, r) => s + r.fytdAmount, 0) || 0
  const totalOutlays = data?.outlays?.categories?.reduce((s, o) => s + o.fytdAmount, 0) || 0
  const netIncome = totalRevenue - totalOutlays

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-elevated">
          <div className="text-xs text-text-muted mb-1">FYTD Revenue</div>
          <div className="font-mono text-2xl text-positive">{billions(totalRevenue)}</div>
          {data?.revenue && <div className="text-[10px] text-text-muted mt-1">FY{data.revenue.fiscalYear} through M{data.revenue.month}</div>}
        </div>
        <div className="card-elevated">
          <div className="text-xs text-text-muted mb-1">FYTD Outlays</div>
          <div className="font-mono text-2xl text-crimson">{billions(totalOutlays)}</div>
        </div>
        <div className="card-elevated">
          <div className="text-xs text-text-muted mb-1">Net Income (Loss)</div>
          <div className={`font-mono text-2xl ${netIncome >= 0 ? 'text-positive' : 'text-crimson'}`}>{billions(Math.abs(netIncome))}</div>
          <div className="text-[10px] text-text-muted mt-1">{netIncome >= 0 ? 'Surplus' : 'Deficit'}</div>
        </div>
      </div>

      {/* Revenue by Source */}
      {data?.revenue?.sources && data.revenue.sources.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
            <ArrowUpRight className="w-5 h-5 text-positive" />
            Revenue by Source
          </h2>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
              <div className="col-span-5">Source</div>
              <div className="col-span-2 text-right">This Month</div>
              <div className="col-span-2 text-right">FYTD</div>
              <div className="col-span-2 text-right">Prior FYTD</div>
              <div className="col-span-1 text-right">YoY</div>
            </div>
            {data.revenue.sources.map((s, i) => {
              const yoy = s.priorFytd > 0 ? ((s.fytdAmount - s.priorFytd) / s.priorFytd) * 100 : null
              return (
                <div key={i} className="card grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-5 text-sm text-ivory">{s.category}</div>
                  <div className="col-span-2 text-right font-mono text-sm text-text-secondary">{millions(s.monthAmount)}</div>
                  <div className="col-span-2 text-right font-mono text-sm text-ivory">{billions(s.fytdAmount)}</div>
                  <div className="col-span-2 text-right font-mono text-sm text-text-muted">{billions(s.priorFytd)}</div>
                  <div className="col-span-1 text-right">
                    {yoy != null ? <span className={`font-mono text-xs ${yoy >= 0 ? 'text-positive' : 'text-crimson'}`}>{fmtPct(yoy)}</span> : <span className="text-text-muted">--</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Outlays by Category */}
      {data?.outlays?.categories && data.outlays.categories.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
            <ArrowDownRight className="w-5 h-5 text-crimson" />
            Outlays by Category
          </h2>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
              <div className="col-span-5">Category</div>
              <div className="col-span-2 text-right">This Month</div>
              <div className="col-span-2 text-right">FYTD</div>
              <div className="col-span-2 text-right">Prior FYTD</div>
              <div className="col-span-1 text-right">YoY</div>
            </div>
            {data.outlays.categories.map((o, i) => {
              const yoy = o.priorFytd > 0 ? ((o.fytdAmount - o.priorFytd) / o.priorFytd) * 100 : null
              return (
                <div key={i} className="card grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-5 text-sm text-ivory">{o.category}</div>
                  <div className="col-span-2 text-right font-mono text-sm text-text-secondary">{millions(o.monthAmount)}</div>
                  <div className="col-span-2 text-right font-mono text-sm text-ivory">{billions(o.fytdAmount)}</div>
                  <div className="col-span-2 text-right font-mono text-sm text-text-muted">{billions(o.priorFytd)}</div>
                  <div className="col-span-1 text-right">
                    {yoy != null ? <span className={`font-mono text-xs ${yoy >= 0 ? 'text-crimson' : 'text-positive'}`}>{fmtPct(yoy)}</span> : <span className="text-text-muted">--</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// --- Balance Sheet ---
function BalanceSheet() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['treasury-statements', 'balance_sheet'],
    queryFn: statementsService.getBalanceSheet,
    staleTime: 30 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000, refetchOnWindowFocus: false,
  })

  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorCard message={error.message} />

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets side */}
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-positive mb-4">
            <ArrowUpRight className="w-5 h-5" />
            Assets
          </h2>
          {data?.cashBalance && (
            <div className="space-y-3">
              <div className="card-elevated">
                <div className="text-xs text-text-muted mb-1">Treasury Operating Cash</div>
                <div className="font-mono text-2xl text-ivory">{billions(data.cashBalance.closingBalance)}</div>
                <div className="text-[10px] text-text-muted mt-1">as of {data.cashBalance.date}</div>
              </div>
              {data.cashBalance.entries && data.cashBalance.entries.length > 1 && (
                <div className="space-y-1">
                  {data.cashBalance.entries.map((e, i) => (
                    <div key={i} className="card flex items-center justify-between">
                      <span className="text-xs text-text-secondary">{e.type}</span>
                      <span className="font-mono text-sm text-ivory">{billions(e.close)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!data?.cashBalance && (
            <div className="card text-sm text-text-muted">Cash balance data unavailable</div>
          )}
        </div>

        {/* Liabilities side */}
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-crimson mb-4">
            <ArrowDownRight className="w-5 h-5" />
            Liabilities
          </h2>
          {data?.debt && (
            <div className="space-y-3">
              <div className="card-elevated">
                <div className="text-xs text-text-muted mb-1">Total Public Debt Outstanding</div>
                <div className="font-mono text-2xl text-ivory">{trillions(data.debt.totalDebt)}</div>
                <div className="text-[10px] text-text-muted mt-1">as of {data.debt.date}</div>
              </div>
              <div className="card flex items-center justify-between">
                <span className="text-xs text-text-secondary">Debt Held by Public</span>
                <span className="font-mono text-sm text-ivory">{trillions(data.debt.publicDebt)}</span>
              </div>
              <div className="card flex items-center justify-between">
                <span className="text-xs text-text-secondary">Intragovernmental Holdings</span>
                <span className="font-mono text-sm text-ivory">{trillions(data.debt.intragovDebt)}</span>
              </div>
            </div>
          )}
          {!data?.debt && (
            <div className="card text-sm text-text-muted">Debt data unavailable</div>
          )}
        </div>
      </div>

      {/* Net Position */}
      {data?.cashBalance && data?.debt && (
        <div className="card-elevated border-crimson/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-text-muted mb-1">Net Position (Cash - Debt)</div>
              <div className="font-mono text-2xl text-crimson">
                -{trillions(data.debt.totalDebt - data.cashBalance.closingBalance)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-text-muted mb-1">Cash-to-Debt Ratio</div>
              <div className="font-mono text-lg text-text-secondary">
                {((data.cashBalance.closingBalance / data.debt.totalDebt) * 100).toFixed(3)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Cash Flow Statement ---
function CashFlowStatement() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['treasury-statements', 'cash_flow'],
    queryFn: statementsService.getCashFlow,
    staleTime: 30 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000, refetchOnWindowFocus: false,
  })

  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorCard message={error.message} />

  const txn = data?.transactions

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      {txn && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-elevated">
              <div className="text-xs text-text-muted mb-1">Today's Deposits</div>
              <div className="font-mono text-xl text-positive">{billions(txn.todayDeposits)}</div>
              <div className="text-[10px] text-text-muted mt-1">{txn.date}</div>
            </div>
            <div className="card-elevated">
              <div className="text-xs text-text-muted mb-1">Today's Withdrawals</div>
              <div className="font-mono text-xl text-crimson">{billions(txn.todayWithdrawals)}</div>
            </div>
            <div className="card-elevated">
              <div className="text-xs text-text-muted mb-1">Net Cash Flow (Today)</div>
              <div className={`font-mono text-xl ${(txn.todayDeposits - txn.todayWithdrawals) >= 0 ? 'text-positive' : 'text-crimson'}`}>
                {billions(Math.abs(txn.todayDeposits - txn.todayWithdrawals))}
              </div>
              <div className="text-[10px] text-text-muted mt-1">
                {(txn.todayDeposits - txn.todayWithdrawals) >= 0 ? 'Net inflow' : 'Net outflow'}
              </div>
            </div>
          </div>

          {/* MTD and FYTD */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Month-to-Date</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Deposits</span>
                  <span className="font-mono text-sm text-positive">{billions(txn.mtdDeposits)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Withdrawals</span>
                  <span className="font-mono text-sm text-crimson">{billions(txn.mtdWithdrawals)}</span>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-ivory font-medium">Net</span>
                  <span className={`font-mono text-sm font-medium ${(txn.mtdDeposits - txn.mtdWithdrawals) >= 0 ? 'text-positive' : 'text-crimson'}`}>
                    {billions(Math.abs(txn.mtdDeposits - txn.mtdWithdrawals))}
                  </span>
                </div>
              </div>
            </div>
            <div className="card">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Fiscal Year-to-Date</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Deposits</span>
                  <span className="font-mono text-sm text-positive">{billions(txn.fytdDeposits)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Withdrawals</span>
                  <span className="font-mono text-sm text-crimson">{billions(txn.fytdWithdrawals)}</span>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-ivory font-medium">Net</span>
                  <span className={`font-mono text-sm font-medium ${(txn.fytdDeposits - txn.fytdWithdrawals) >= 0 ? 'text-positive' : 'text-crimson'}`}>
                    {billions(Math.abs(txn.fytdDeposits - txn.fytdWithdrawals))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash trend chart */}
      {data?.cashTrend && data.cashTrend.length > 2 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
            <Banknote className="w-5 h-5 text-gold" />
            Treasury Cash Balance (30 Days)
          </h2>
          <div className="card">
            <CashChart data={data.cashTrend} />
          </div>
        </section>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════
// Spending Tab
// ════════════════════════════════════════════════════

  function SpendingTab() {
    const { data: spending, isLoading, error, isFetching, refetch } = useQuery({
      queryKey: ['spending-data'],
      queryFn: spendingService.getSpendingOverview,
      staleTime: 30 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000, refetchOnWindowFocus: false,
    })

    if (isLoading) return <LoadingSkeleton />
    if (error) return <ErrorCard message={error.message} />

    const totalSpending = (spending?.budgetFunctions || []).reduce((sum, b) => sum + (b.amount || 0), 0)

    return (
      <div className="space-y-8">
        <div className="flex justify-end">
          <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {totalSpending > 0 && (
          <div className="card-elevated">
            <div className="text-xs text-text-muted mb-1">Total Federal Spending (FY{spending?.fiscalYear})</div>
            <div className="font-mono text-3xl text-ivory">{trillions(totalSpending)}</div>
            <div className="text-xs text-text-muted mt-1">Actual obligations through latest reporting period</div>
          </div>
        )}
        {spending?.budgetFunctions && spending.budgetFunctions.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory mb-4">
              <PiggyBank className="w-5 h-5 text-gold" /> Spending by Budget Function
            </h2>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
                <div className="col-span-5">Function</div>
                <div className="col-span-3 text-right">Amount</div>
                <div className="col-span-2 text-right">% of Total</div>
                <div className="col-span-2 text-right">YoY Change</div>
              </div>
              {spending.budgetFunctions.map((b, i) => {
                const pct = totalSpending > 0 ? (b.amount / totalSpending) * 100 : 0
                return (
                  <div key={i} className="card grid grid-cols-12 gap-4 items-center hover:border-gold-dim transition-colors">
                    <div className="col-span-5">
                      <div className="text-sm text-ivory">{b.name}</div>
                      <div className="mt-1.5 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                        <div className="h-full bg-gold/40 rounded-full" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                      </div>
                    </div>
                    <div className="col-span-3 text-right font-mono text-sm text-ivory">{billions(b.amount)}</div>
                    <div className="col-span-2 text-right font-mono text-sm text-text-secondary">{pct.toFixed(1)}%</div>
                    <div className="col-span-2 text-right">
                      {b.yoyChange != null ? <span className={`font-mono text-sm ${b.yoyChange >= 0 ? 'text-crimson' : 'text-positive'}`}>{fmtPct(b.yoyChange)}</span> : <span className="text-text-muted text-sm">--</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    )
  }

// ════════════════════════════════════════════════════
// Departments Tab
// ════════════════════════════════════════════════════

  function DepartmentsTab() {
    const [view, setView] = useState('actual')
    const { data: spending, isLoading, error } = useQuery({
      queryKey: ['spending-data'],
      queryFn: spendingService.getSpendingOverview,
      staleTime: 30 * 60 * 1000, gcTime: 2 * 60 * 60 * 1000, refetchOnWindowFocus: false,
    })

    if (isLoading) return <LoadingSkeleton />
    if (error) return <ErrorCard message={error.message} />

    const agencies = spending?.agencies || []
    const totalBudget = agencies.reduce((sum, a) => sum + (a.budget || 0), 0)
    const totalObligated = agencies.reduce((sum, a) => sum + (a.obligated || 0), 0)
    const totalOutlays = agencies.reduce((sum, a) => sum + (a.outlays || 0), 0)
    const sorted = view === 'budget' ? [...agencies].sort((a, b) => (b.budget || 0) - (a.budget || 0)) : [...agencies].sort((a, b) => (b.obligated || 0) - (a.obligated || 0))

    return (
      <div className="space-y-8">
        {agencies.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ivory">
                <Building2 className="w-5 h-5 text-gold" /> Top Federal Agencies
              </h2>
              <div className="flex items-center bg-surface-elevated rounded-lg p-0.5 border border-border">
                <button onClick={() => setView('actual')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'actual' ? 'bg-gold/20 text-gold border border-gold-dim' : 'text-text-secondary hover:text-ivory'}`}>Actual to Date</button>
                <button onClick={() => setView('budget')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${view === 'budget' ? 'bg-gold/20 text-gold border border-gold-dim' : 'text-text-secondary hover:text-ivory'}`}>Budget Authority</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className={`card ${view === 'budget' ? 'border-gold-dim' : ''}`}>
                <div className="text-xs text-text-muted mb-1">Budget Authority</div>
                <div className="font-mono text-xl text-ivory">{trillions(totalBudget)}</div>
              </div>
              <div className={`card ${view === 'actual' ? 'border-gold-dim' : ''}`}>
                <div className="text-xs text-text-muted mb-1">Obligations</div>
                <div className="font-mono text-xl text-ivory">{trillions(totalObligated)}</div>
              </div>
              <div className="card">
                <div className="text-xs text-text-muted mb-1">Outlays</div>
                <div className="font-mono text-xl text-ivory">{trillions(totalOutlays)}</div>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-4">FY{spending?.fiscalYear} {view === 'actual' ? '— Obligations with budget comparison' : '— Budget authority with obligation rates'}</p>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-4 px-5 py-2 text-xs text-text-muted uppercase tracking-wide">
                <div className="col-span-3">Agency</div>
                <div className="col-span-2 text-right">{view === 'actual' ? 'Obligations' : 'Budget Auth'}</div>
                <div className="col-span-2 text-right">{view === 'actual' ? 'Outlays' : 'Obligations'}</div>
                <div className="col-span-3 text-right">{view === 'actual' ? 'vs Budget' : 'Obligation Rate'}</div>
                <div className="col-span-2 text-right">% of Total</div>
              </div>
              {sorted.map((a, i) => {
                const primary = view === 'budget' ? (a.budget || 0) : (a.obligated || 0)
                const secondary = view === 'budget' ? (a.obligated || 0) : (a.outlays || 0)
                const total = view === 'budget' ? totalBudget : totalObligated
                const pctOfTotal = total > 0 ? ((primary / total) * 100).toFixed(1) : '0.0'
                let comparison = null
                if (view === 'actual' && a.budget && a.budget > 0) {
                  const usedPct = ((a.obligated || 0) / a.budget) * 100
                  const color = usedPct > 90 ? 'text-crimson' : usedPct > 70 ? 'text-gold' : 'text-positive'
                  comparison = <span className={`font-mono text-sm ${color}`}>{usedPct.toFixed(0)}% used</span>
                } else if (view === 'budget' && a.budget && a.budget > 0) {
                  const rate = ((a.obligated || 0) / a.budget) * 100
                  const color = rate > 90 ? 'text-crimson' : rate > 70 ? 'text-gold' : 'text-positive'
                  comparison = <div className="flex items-center justify-end gap-2"><div className="w-16 h-1.5 bg-surface-elevated rounded-full overflow-hidden"><div className={`h-full rounded-full ${rate > 90 ? 'bg-crimson' : rate > 70 ? 'bg-gold' : 'bg-positive'}`} style={{ width: `${Math.min(rate, 100)}%` }} /></div><span className={`font-mono text-sm ${color}`}>{rate.toFixed(0)}%</span></div>
                }
                return (
                  <div key={i} className="card grid grid-cols-12 gap-4 items-center hover:border-gold-dim transition-colors">
                    <div className="col-span-3">
                      <div className="text-sm text-ivory">{a.name}</div>
                      {a.abbreviation && <div className="text-[10px] text-text-muted font-mono">{a.abbreviation}</div>}
                    </div>
                    <div className="col-span-2 text-right font-mono text-sm text-ivory">{billions(primary)}</div>
                    <div className="col-span-2 text-right font-mono text-sm text-text-secondary">{billions(secondary)}</div>
                    <div className="col-span-3 text-right">{comparison || <span className="text-text-muted text-sm">--</span>}</div>
                    <div className="col-span-2 text-right font-mono text-sm text-text-secondary">{pctOfTotal}%</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    )
  }

// ════════════════════════════════════════════════════
// Cash Balance Chart
// ════════════════════════════════════════════════════

function CashChart({ data }) {
  if (!data || data.length < 2) return null
  const values = data.map((d) => d.balance)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const width = 700, height = 180, padding = 40
  const chartW = width - padding * 2, chartH = height - padding * 2

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartW
    const y = padding + chartH - ((d.balance - min) / range) * chartH
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.5, 1].map((pct) => {
        const y = padding + chartH - pct * chartH
        const val = min + pct * range
        return (
          <g key={pct}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--color-border, #2A2A33)" strokeWidth="1" />
            <text x={padding - 5} y={y + 3} textAnchor="end" fontSize="8" fill="var(--color-text-muted, #5A5E66)">${(val / 1e9).toFixed(0)}B</text>
          </g>
        )
      })}
      <polyline points={points} fill="none" stroke="#C9A961" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.filter((_, i) => i === 0 || i === data.length - 1).map((d, idx) => {
        const i = idx === 0 ? 0 : data.length - 1
        const x = padding + (i / (data.length - 1)) * chartW
        return (
          <text key={d.date} x={x} y={height - 5} textAnchor="middle" fontSize="8" fill="var(--color-text-muted, #5A5E66)">
            {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        )
      })}
    </svg>
  )
}
