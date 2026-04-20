import { useState, useMemo } from 'react'
import {
  ArrowRight, Check, X, Play, Loader2, AlertTriangle, Sparkles,
} from 'lucide-react'
import { applyChanges, computeAllocation, canDirectApply } from '../../lib/portfolioSim'

const ACTION_LABEL = {
  buy: 'Buy',
  add: 'Add to',
  trim: 'Trim',
  sell: 'Sell all',
}

const ACTION_COLOR = {
  buy: 'text-positive',
  add: 'text-positive',
  trim: 'text-crimson',
  sell: 'text-crimson',
}

const ASSET_TYPE_LABEL = {
  stock: 'Stock',
  etf: 'ETF',
  mutual_fund: 'Mutual Fund',
}

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return n.toFixed(1) + '%'
}
function formatShares(n) {
  if (n == null || !Number.isFinite(n)) return '--'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function ImpactTile({ label, before, after, formatter }) {
  const delta = (after ?? 0) - (before ?? 0)
  const hasDelta = Math.abs(delta) > 0.01
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">{label}</div>
      <div className="flex items-center gap-2 font-mono text-sm">
        <span className="text-text-muted">{formatter(before)}</span>
        <ArrowRight className="w-3 h-3 text-text-muted shrink-0" />
        <span className="text-ivory">{formatter(after)}</span>
      </div>
      {hasDelta && (
        <div className={`text-[10px] font-mono mt-0.5 ${delta >= 0 ? 'text-positive' : 'text-crimson'}`}>
          {delta >= 0 ? '+' : ''}{formatter(delta)}
        </div>
      )}
    </div>
  )
}

export default function TradeProposalCard({
  proposal,
  positions,
  quotes,
  onApply,
  onDismiss,
  isApplying,
  applyError,
  canApply, // false for anonymous users until portfolio is un-gated
}) {
  const [simulated, setSimulated] = useState(false)
  const changes = proposal.changes || []
  const directApply = canDirectApply(changes)

  const simulation = useMemo(() => {
    if (!simulated) return null
    const { hypotheticalPositions, issues } = applyChanges(positions, changes)
    const current = computeAllocation(positions, quotes)
    const next = computeAllocation(hypotheticalPositions, quotes)
    return { current, next, issues }
  }, [simulated, positions, changes, quotes])

  // Merge asset types from both current and hypothetical so types dropped
  // to zero or added fresh both appear in the diff.
  const assetTypeKeys = useMemo(() => {
    if (!simulation) return []
    const keys = new Set([
      ...Object.keys(simulation.current.assetClassPct),
      ...Object.keys(simulation.next.assetClassPct),
    ])
    return [...keys]
  }, [simulation])

  return (
    <div className="card-elevated border-gold-dim bg-gold/[0.03]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" />
        <div className="text-[9px] uppercase tracking-[0.2em] text-gold font-semibold">
          Trade Proposal
        </div>
      </div>

      {proposal.rationale && (
        <p className="text-sm text-text-secondary mb-4 leading-relaxed">
          {proposal.rationale}
        </p>
      )}

      <div className="space-y-0 mb-4">
        {changes.map((c, i) => (
          <div
            key={i}
            className="flex items-start gap-3 py-2 border-t border-border first:border-t-0"
          >
            <div className={`text-xs font-semibold uppercase tracking-wide min-w-[60px] ${ACTION_COLOR[c.action] || 'text-ivory'}`}>
              {ACTION_LABEL[c.action] || c.action}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-ivory font-medium">{c.symbol}</span>
                <span className="text-xs text-text-muted">
                  {formatShares(c.shares)} shares · {ASSET_TYPE_LABEL[c.assetType] || c.assetType}
                </span>
              </div>
              {c.reason && (
                <div className="text-xs text-text-secondary mt-0.5 leading-snug">
                  {c.reason}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {simulation && (
        <div className="bg-surface rounded-lg p-4 mb-4 border border-border">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-3">
            Simulated Impact
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <ImpactTile
              label="Total value"
              before={simulation.current.totalValue}
              after={simulation.next.totalValue}
              formatter={formatMoney}
            />
            <ImpactTile
              label="Top 3 concentration"
              before={simulation.current.top3Pct}
              after={simulation.next.top3Pct}
              formatter={formatPct}
            />
          </div>

          {assetTypeKeys.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">
                Asset class
              </div>
              {assetTypeKeys.map((type) => {
                const before = simulation.current.assetClassPct[type] || 0
                const after = simulation.next.assetClassPct[type] || 0
                const delta = after - before
                return (
                  <div key={type} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-ivory">{ASSET_TYPE_LABEL[type] || type}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-text-muted w-12 text-right">{formatPct(before)}</span>
                      <ArrowRight className="w-3 h-3 text-text-muted shrink-0" />
                      <span className="text-ivory w-12 text-right">{formatPct(after)}</span>
                      {Math.abs(delta) >= 0.1 && (
                        <span className={`text-[10px] w-12 text-right ${delta >= 0 ? 'text-positive' : 'text-crimson'}`}>
                          ({delta >= 0 ? '+' : ''}{delta.toFixed(1)})
                        </span>
                      )}
                      {Math.abs(delta) < 0.1 && <span className="w-12" />}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {simulation.current.positionCount !== simulation.next.positionCount && (
            <div className="text-[11px] text-text-secondary mt-3 font-mono">
              Positions: {simulation.current.positionCount} → {simulation.next.positionCount}
            </div>
          )}

          {simulation.issues.length > 0 && (
            <div className="flex items-start gap-2 mt-3 p-2 rounded bg-crimson/5 border border-crimson/20">
              <AlertTriangle className="w-3.5 h-3.5 text-crimson shrink-0 mt-0.5" />
              <div className="text-[11px] text-crimson space-y-0.5">
                {simulation.issues.map((msg, i) => <div key={i}>{msg}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {applyError && (
        <div className="flex items-start gap-2 mb-3 p-2 rounded bg-crimson/5 border border-crimson/20">
          <AlertTriangle className="w-3.5 h-3.5 text-crimson shrink-0 mt-0.5" />
          <div className="text-[11px] text-crimson">{applyError}</div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!simulated ? (
          <button onClick={() => setSimulated(true)} className="btn-secondary flex-1">
            <Play className="w-3.5 h-3.5" />
            Simulate impact
          </button>
        ) : (
          <button onClick={() => setSimulated(false)} className="btn-ghost flex-1">
            Hide impact
          </button>
        )}
        {canApply && onApply && directApply && (
          <button
            onClick={() => onApply(changes)}
            disabled={isApplying}
            className="btn-primary flex-1"
          >
            {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Apply
          </button>
        )}
        <button onClick={onDismiss} className="btn-ghost p-2" title="Dismiss proposal">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!canApply && (
        <div className="text-[10px] text-text-muted mt-2 text-right">
          Sign in to apply changes to a saved portfolio.
        </div>
      )}
      {canApply && !directApply && (
        <div className="text-[10px] text-text-muted mt-2 text-right">
          Includes new purchases — add via Portfolio page so you can set cost basis.
        </div>
      )}
    </div>
  )
}
