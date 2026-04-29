import { Plus, Trash2, ArrowRight } from 'lucide-react'

const CATEGORY_BADGE = {
  core: 'bg-gold/10 text-gold',
  growth: 'bg-positive/10 text-positive',
  income: 'bg-gold/10 text-gold',
  satellite: 'bg-patriot-bright/10 text-patriot-bright',
  defensive: 'bg-text-muted/20 text-text-secondary',
}

const ASSET_LABEL = {
  stock: 'Stock',
  etf: 'ETF',
  mutual_fund: 'Mutual Fund',
}

const RISK_FIT_BADGE = {
  conservative: 'text-positive',
  moderate: 'text-gold',
  aggressive: 'text-crimson',
}

export default function SuggestionCard({
  suggestion,
  onAddToBench,
  onAddToPortfolio,
  onDismiss,
  busy = false,
}) {
  const s = suggestion
  return (
    <div className="card hover:border-gold-dim transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono font-bold text-ivory text-base">{s.symbol}</span>
            <span className="text-[9px] uppercase tracking-wide text-text-muted bg-surface-elevated px-1.5 py-0.5 rounded">
              {ASSET_LABEL[s.asset_type] || s.asset_type}
            </span>
            {s.category && (
              <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${CATEGORY_BADGE[s.category] || 'bg-text-muted/20 text-text-secondary'}`}>
                {s.category}
              </span>
            )}
            {s.risk_fit && (
              <span className={`text-[9px] uppercase tracking-wide font-medium ${RISK_FIT_BADGE[s.risk_fit] || 'text-text-muted'}`}>
                {s.risk_fit} fit
              </span>
            )}
          </div>
          {s.name && (
            <div className="text-sm text-text-secondary mb-2">{s.name}</div>
          )}
          {s.rationale && (
            <p className="text-xs text-text-secondary leading-relaxed">
              {s.rationale}
            </p>
          )}
        </div>

        <div className="flex sm:flex-col items-stretch gap-2 sm:w-44 shrink-0">
          {onAddToBench && (
            <button
              onClick={onAddToBench}
              disabled={busy}
              className="btn-secondary text-xs flex-1 sm:flex-none justify-center"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Add to Bench
            </button>
          )}
          {onAddToPortfolio && (
            <button
              onClick={onAddToPortfolio}
              disabled={busy}
              className="btn-primary text-xs flex-1 sm:flex-none justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Position
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={busy}
              className="btn-ghost text-xs text-text-muted hover:text-crimson sm:flex-none justify-center"
              title="Dismiss this suggestion"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
