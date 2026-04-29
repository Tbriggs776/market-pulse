import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  User, Sparkles, Pencil, Loader2, AlertTriangle, Check, ArrowRight,
} from 'lucide-react'
import { investmentRulesApi } from '../lib/supabase'
import { suggestionsService } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import OnboardingWizard, { rulesRowToFormValues, ONBOARDING_STEPS } from '../components/onboarding/OnboardingWizard'

const RULE_LABELS = {
  goal: {
    label: 'Primary goal',
    options: {
      retirement: 'Long-term retirement',
      wealth: 'General wealth building',
      income: 'Income generation',
      preservation: 'Capital preservation',
    },
  },
  time_horizon: {
    label: 'Time horizon',
    options: {
      under_5: 'Less than 5 years',
      '5_to_10': '5-10 years',
      '10_to_20': '10-20 years',
      over_20: '20+ years',
    },
  },
  risk_tolerance: {
    label: 'Risk tolerance',
    options: {
      conservative: 'Conservative',
      moderate: 'Moderate',
      aggressive: 'Aggressive',
    },
  },
  income_need: {
    label: 'Income need',
    options: {
      none: 'No income needed',
      supplemental: 'Supplemental income',
      primary: 'Primary income',
    },
  },
  experience: {
    label: 'Experience',
    options: {
      beginner: 'Beginner',
      intermediate: 'Intermediate',
      advanced: 'Advanced',
    },
  },
  account_type: {
    label: 'Account type',
    options: {
      taxable: 'Taxable brokerage',
      tax_advantaged: 'Tax-advantaged (IRA / 401k / HSA)',
      both: 'Mix of both',
    },
  },
  capital_range: {
    label: 'Initial capital',
    options: {
      under_10k: 'Under $10,000',
      '10_50k': '$10,000 - $50,000',
      '50_250k': '$50,000 - $250,000',
      over_250k: '$250,000+',
    },
  },
}

function RuleRow({ field, value }) {
  const cfg = RULE_LABELS[field]
  const display = cfg?.options?.[value] || value || '—'
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/40 last:border-b-0">
      <div className="text-xs text-text-secondary uppercase tracking-wide">
        {cfg?.label || field}
      </div>
      <div className={`text-sm font-mono ${value ? 'text-ivory' : 'text-text-muted'}`}>
        {display}
      </div>
    </div>
  )
}

export default function Profile() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState('')

  const rulesQ = useQuery({
    queryKey: ['investment-rules'],
    queryFn: investmentRulesApi.get,
    staleTime: 60 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: investmentRulesApi.save,
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['investment-rules'] })
      setEditing(false)
      // Trigger generation in the background; user can navigate to /suggestions
      // to see them. We don't await -- regenerate is best-effort.
      try {
        await suggestionsService.generate()
        queryClient.invalidateQueries({ queryKey: ['investment-suggestions'] })
      } catch (_) { /* surfaced on Suggestions page if visited */ }
    },
    onError: (err) => {
      setSaveError(err.message || 'Could not save rules')
    },
  })

  const rules = rulesQ.data
  const isCompleted = rules?.onboarding_status === 'completed'

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <OnboardingWizard
        open={editing}
        initialValues={rulesRowToFormValues(rules)}
        pending={saveMutation.isPending}
        error={saveError}
        title={isCompleted ? 'Edit Investment Rules' : 'Investment Rules'}
        subtitle="The advisor reads these rules. Update anytime."
        isEdit={isCompleted}
        onComplete={(values) => {
          setSaveError('')
          saveMutation.mutate(values)
        }}
        onClose={() => { setEditing(false); setSaveError('') }}
      />

      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">Profile</h1>
        <p className="text-sm text-text-secondary">
          Account info and Investment Rules.
        </p>
      </div>

      {/* Account */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-sm text-gold uppercase tracking-wide">
          <User className="w-4 h-4" />
          Account
        </div>
        <div className="flex items-baseline justify-between py-1.5">
          <div className="text-xs text-text-secondary uppercase tracking-wide">Name</div>
          <div className="text-sm text-ivory">{profile?.display_name || '—'}</div>
        </div>
        <div className="flex items-baseline justify-between py-1.5 border-t border-border/40">
          <div className="text-xs text-text-secondary uppercase tracking-wide">Email</div>
          <div className="text-sm font-mono text-ivory">{profile?.email || user?.email || '—'}</div>
        </div>
      </div>

      {/* Investment Rules */}
      <div className="card-elevated border-gold/20 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded bg-gold/10">
              <Sparkles className="w-4 h-4 text-gold" />
            </div>
            <div>
              <div className="text-sm text-gold uppercase tracking-wide font-medium">
                Investment Rules
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Drives the advisor's recommendations and your suggested ideas.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEditing(true); setSaveError('') }}
            className="btn-secondary text-sm shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            {isCompleted ? 'Edit' : 'Set up'}
          </button>
        </div>

        {rulesQ.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-gold animate-spin" />
          </div>
        )}

        {!rulesQ.isLoading && !isCompleted && (
          <div className="bg-surface/40 rounded-md p-4 text-center">
            <p className="text-sm text-text-secondary mb-3">
              You haven't set your Investment Rules yet. Takes about a minute.
            </p>
            <button
              onClick={() => setEditing(true)}
              className="btn-primary text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Get Started
            </button>
          </div>
        )}

        {!rulesQ.isLoading && isCompleted && (
          <>
            <div className="bg-surface/40 rounded-md p-4">
              {Object.keys(RULE_LABELS).map((field) => (
                <RuleRow key={field} field={field} value={rules[field]} />
              ))}
              {rules.exclusions && (
                <div className="pt-3 mt-3 border-t border-border/40">
                  <div className="text-xs text-text-secondary uppercase tracking-wide mb-1.5">
                    Things to avoid
                  </div>
                  <div className="text-sm text-ivory leading-relaxed">
                    {rules.exclusions}
                  </div>
                </div>
              )}
            </div>

            <Link to="/suggestions" className="btn-primary w-full text-sm justify-center">
              <ArrowRight className="w-4 h-4" />
              View Suggested Ideas
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
