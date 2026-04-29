import { useState, useEffect } from 'react'
import {
  X, ChevronLeft, ChevronRight, Check, Sparkles, Loader2, AlertTriangle,
} from 'lucide-react'

const STEPS = [
  {
    id: 'goal',
    label: 'What\'s your primary investment goal?',
    description: 'Pick the one that fits best -- you can refine later.',
    type: 'choice',
    options: [
      { value: 'retirement', label: 'Long-term retirement', description: 'Building a nest egg for years out' },
      { value: 'wealth', label: 'General wealth building', description: 'Growing assets steadily over decades' },
      { value: 'income', label: 'Income generation', description: 'Cash flow from dividends + interest' },
      { value: 'preservation', label: 'Capital preservation', description: 'Protecting what I already have' },
    ],
  },
  {
    id: 'timeHorizon',
    label: 'When do you need this money?',
    description: 'Time horizon shapes how much volatility makes sense.',
    type: 'choice',
    options: [
      { value: 'under_5', label: 'Less than 5 years' },
      { value: '5_to_10', label: '5-10 years' },
      { value: '10_to_20', label: '10-20 years' },
      { value: 'over_20', label: '20+ years' },
    ],
  },
  {
    id: 'riskTolerance',
    label: 'How would you describe your risk tolerance?',
    description: 'Comfort with seeing your portfolio drop in a bad market.',
    type: 'choice',
    options: [
      { value: 'conservative', label: 'Conservative', description: 'A 20% drawdown would shake me' },
      { value: 'moderate', label: 'Moderate', description: 'I can ride out 30% downturns if I trust the long-term plan' },
      { value: 'aggressive', label: 'Aggressive', description: '50%+ drawdowns are part of the game; I won\'t panic-sell' },
    ],
  },
  {
    id: 'incomeNeed',
    label: 'Do you need income from this portfolio?',
    description: 'Cash flow today vs. compounding for later.',
    type: 'choice',
    options: [
      { value: 'none', label: 'No income needed', description: 'Reinvest everything; I have other cash flow' },
      { value: 'supplemental', label: 'Supplemental income', description: 'Nice to have; not required' },
      { value: 'primary', label: 'Primary income', description: 'I rely on this portfolio for living expenses' },
    ],
  },
  {
    id: 'experience',
    label: 'How would you describe your investing experience?',
    type: 'choice',
    options: [
      { value: 'beginner', label: 'Beginner', description: 'New to investing; want simple, broad exposure' },
      { value: 'intermediate', label: 'Intermediate', description: 'I\'ve built portfolios; understand sectors + asset classes' },
      { value: 'advanced', label: 'Advanced', description: 'Comfortable with options, individual analysis, complex products' },
    ],
  },
  {
    id: 'accountType',
    label: 'What type of account is this?',
    description: 'Affects how we weight tax-efficient picks.',
    type: 'choice',
    options: [
      { value: 'taxable', label: 'Taxable brokerage' },
      { value: 'tax_advantaged', label: 'Tax-advantaged (IRA, 401k, HSA)' },
      { value: 'both', label: 'Mix of both' },
    ],
  },
  {
    id: 'capitalRange',
    label: 'Roughly how much will you start with?',
    description: 'Smaller starting amounts favor diversified ETFs over single names.',
    type: 'choice',
    options: [
      { value: 'under_10k', label: 'Under $10,000' },
      { value: '10_50k', label: '$10,000 - $50,000' },
      { value: '50_250k', label: '$50,000 - $250,000' },
      { value: 'over_250k', label: '$250,000+' },
    ],
  },
  {
    id: 'exclusions',
    label: 'Anything to avoid?',
    description: 'Sectors, individual companies, or themes you don\'t want exposure to. Free-form. Skip if none.',
    type: 'text',
    placeholder: 'e.g. tobacco, leveraged ETFs, single-stock concentration above 10%, fossil fuels',
    optional: true,
  },
]

const EMPTY = STEPS.reduce((acc, s) => { acc[s.id] = ''; return acc }, {})

function ChoiceCard({ option, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md border p-3 transition-colors ${
        selected
          ? 'border-gold bg-gold/10'
          : 'border-border bg-surface/40 hover:border-gold-dim hover:bg-surface'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`w-3.5 h-3.5 rounded-full border shrink-0 mt-0.5 ${
          selected ? 'border-gold bg-gold' : 'border-text-muted'
        }`}>
          {selected && <Check className="w-3 h-3 text-canvas" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${selected ? 'text-gold' : 'text-ivory'}`}>
            {option.label}
          </div>
          {option.description && (
            <div className="text-xs text-text-secondary mt-0.5 leading-snug">
              {option.description}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function OnboardingWizard({
  open,
  initialValues = null,
  onComplete,        // (rules) => Promise<void> -- caller saves + redirects
  onDismiss,         // () => Promise<void> -- "skip for now"
  onClose,           // () => void -- close without dismissing (e.g. backdrop click on edit-mode)
  pending = false,
  error = null,
  title = 'Investment Rules',
  subtitle = 'A few questions so the advisor and your suggested ideas reflect your actual goals.',
  isEdit = false,    // hides "skip" button when editing existing rules
}) {
  const [step, setStep] = useState(0)
  const [values, setValues] = useState(EMPTY)

  // Re-seed when the modal opens (handles edit-flow with prefilled values).
  useEffect(() => {
    if (!open) return
    setStep(0)
    setValues(initialValues
      ? STEPS.reduce((acc, s) => {
          acc[s.id] = initialValues[s.id] || ''
          return acc
        }, {})
      : EMPTY)
  }, [open, initialValues])

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const currentValue = values[current.id]
  const canAdvance = current.optional || (currentValue && currentValue.trim().length > 0)

  function handleSelect(value) {
    setValues((prev) => ({ ...prev, [current.id]: value }))
  }

  function handleNext() {
    if (!canAdvance) return
    if (isLast) {
      onComplete?.(values)
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-6 bg-canvas/85 backdrop-blur-sm overflow-y-auto">
      <div className="card-elevated border-gold/30 max-w-xl w-full my-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 rounded bg-gold/10 shrink-0">
            <Sparkles className="w-4 h-4 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold font-semibold">
              {title}
            </div>
            <p className="text-xs text-text-secondary mt-1">{subtitle}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="btn-ghost p-1 shrink-0" title="Close">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded ${
                i < step ? 'bg-gold' : i === step ? 'bg-gold-dim' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <div className="mb-5">
          <h2 className="font-serif text-xl text-ivory mb-1">{current.label}</h2>
          {current.description && (
            <p className="text-xs text-text-secondary">{current.description}</p>
          )}
        </div>

        {/* Body */}
        {current.type === 'choice' && (
          <div className="space-y-2 mb-6">
            {current.options.map((opt) => (
              <ChoiceCard
                key={opt.value}
                option={opt}
                selected={currentValue === opt.value}
                onClick={() => handleSelect(opt.value)}
              />
            ))}
          </div>
        )}

        {current.type === 'text' && (
          <textarea
            value={currentValue || ''}
            onChange={(e) => handleSelect(e.target.value)}
            placeholder={current.placeholder}
            rows={4}
            maxLength={500}
            className="input w-full resize-none mb-6 text-sm"
          />
        )}

        {error && (
          <div className="flex items-start gap-2 mb-4 text-crimson text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
            className="btn-ghost text-sm flex items-center gap-1 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-2">
            {!isEdit && onDismiss && (
              <button
                onClick={() => onDismiss?.()}
                disabled={pending}
                className="btn-ghost text-xs text-text-muted hover:text-ivory"
              >
                Skip for now
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canAdvance || pending}
              className="btn-primary"
            >
              {pending && isLast ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isLast ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              {isLast
                ? (pending ? 'Generating...' : isEdit ? 'Save Rules' : 'Save & Generate')
                : 'Next'}
            </button>
          </div>
        </div>

        <div className="text-[10px] text-text-muted text-center mt-3">
          Educational suggestions only. Not professional investment advice.
        </div>
      </div>
    </div>
  )
}

// Helper: convert DB row keys to wizard form keys (snake_case -> camelCase).
export function rulesRowToFormValues(row) {
  if (!row) return null
  return {
    goal: row.goal || '',
    timeHorizon: row.time_horizon || '',
    riskTolerance: row.risk_tolerance || '',
    incomeNeed: row.income_need || '',
    experience: row.experience || '',
    accountType: row.account_type || '',
    capitalRange: row.capital_range || '',
    exclusions: row.exclusions || '',
  }
}

export { STEPS as ONBOARDING_STEPS }
