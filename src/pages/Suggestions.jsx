import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles, RefreshCw, AlertTriangle, Lightbulb, Settings, Loader2, Info,
} from 'lucide-react'
import { suggestionsService } from '../lib/api'
import { investmentRulesApi, investmentSuggestionsApi, benchApi } from '../lib/supabase'
import SuggestionCard from '../components/onboarding/SuggestionCard'
import AddPositionModal from '../components/portfolio/AddPositionModal'

const CATEGORY_ORDER = ['core', 'growth', 'income', 'satellite', 'defensive']
const CATEGORY_LABEL = {
  core: 'Core Holdings',
  growth: 'Growth',
  income: 'Income',
  satellite: 'Satellite',
  defensive: 'Defensive',
}

export default function Suggestions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [addPositionFor, setAddPositionFor] = useState(null)

  const rulesQ = useQuery({
    queryKey: ['investment-rules'],
    queryFn: investmentRulesApi.get,
    staleTime: 60 * 1000,
  })
  const suggestionsQ = useQuery({
    queryKey: ['investment-suggestions'],
    queryFn: investmentSuggestionsApi.list,
    staleTime: 30 * 1000,
  })

  const generateMutation = useMutation({
    mutationFn: suggestionsService.generate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-suggestions'] })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: investmentSuggestionsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-suggestions'] })
    },
  })

  const benchAddMutation = useMutation({
    mutationFn: ({ symbol, name, sector }) => benchApi.add({ symbol, name, sector }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-bench'] })
    },
  })

  const rules = rulesQ.data
  const suggestions = suggestionsQ.data || []

  const grouped = useMemo(() => {
    const out = {}
    for (const s of suggestions) {
      const cat = s.category || 'core'
      if (!out[cat]) out[cat] = []
      out[cat].push(s)
    }
    return out
  }, [suggestions])

  const orderedCategories = CATEGORY_ORDER.filter((c) => grouped[c]?.length > 0)
  const generatedAt = suggestions.length > 0
    ? new Date(suggestions[0].generated_at)
    : null

  // No rules yet -- prompt to set them.
  if (rulesQ.isLoading || suggestionsQ.isLoading) {
    return (
      <div className="card text-center py-16">
        <Loader2 className="w-6 h-6 text-gold animate-spin mx-auto" />
      </div>
    )
  }

  if (!rules || rules.onboarding_status !== 'completed') {
    return (
      <div className="card-elevated text-center py-16 px-6 max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold-dim flex items-center justify-center mx-auto mb-4">
          <Settings className="w-5 h-5 text-gold" />
        </div>
        <h3 className="font-serif text-xl text-ivory mb-2">Set Your Investment Rules First</h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          Suggestions are personalized to your goals, time horizon, and risk tolerance.
          Take a couple minutes to set your rules and we'll generate a curated list.
        </p>
        <Link to="/profile" className="btn-primary inline-flex items-center gap-2">
          Set Investment Rules
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AddPositionModal
        open={!!addPositionFor}
        onClose={() => setAddPositionFor(null)}
        onSuccess={() => setAddPositionFor(null)}
        presetSymbol={addPositionFor?.symbol}
        presetName={addPositionFor?.name}
        title={addPositionFor ? `Add ${addPositionFor.symbol} to Portfolio` : 'Add Position'}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Suggested Ideas
          </h1>
          <p className="text-sm text-text-secondary">
            {suggestions.length > 0
              ? `${suggestions.length} ideas curated to your Investment Rules${generatedAt ? ` · generated ${generatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
              : 'Generate a curated list based on your Investment Rules.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/profile" className="btn-secondary text-sm">
            <Settings className="w-4 h-4" />
            Rules
          </Link>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="btn-primary text-sm"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {suggestions.length > 0 ? 'Regenerate' : 'Generate Ideas'}
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card border-gold-dim bg-gold/5 py-3">
        <div className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
          <Info className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
          <span>
            <span className="text-ivory font-medium">Educational suggestions only.</span>{' '}
            Use these as research starting points, not professional advice.
            Verify the fit against your full financial picture and consult a licensed
            advisor before acting.
          </span>
        </div>
      </div>

      {/* Generation error */}
      {generateMutation.error && (
        <div className="card border-crimson/30">
          <div className="flex items-start gap-2 text-crimson text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{generateMutation.error.message || 'Could not generate suggestions'}</span>
          </div>
        </div>
      )}

      {/* Generation pending */}
      {generateMutation.isPending && suggestions.length === 0 && (
        <div className="card-elevated text-center py-16">
          <Loader2 className="w-6 h-6 text-gold animate-spin mx-auto mb-3" />
          <div className="text-sm text-ivory">Generating ideas...</div>
          <div className="text-xs text-text-muted mt-1">
            Reading your rules and curating tickers. Takes a few seconds.
          </div>
        </div>
      )}

      {/* Empty state -- no suggestions yet */}
      {!generateMutation.isPending && suggestions.length === 0 && (
        <div className="card-elevated text-center py-16">
          <Lightbulb className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <h2 className="text-lg text-ivory font-semibold mb-2">No suggestions yet</h2>
          <p className="text-sm text-text-secondary max-w-md mx-auto mb-6">
            Click <span className="text-gold">Generate Ideas</span> to get a curated set of tickers
            matched to your goals, horizon, and risk tolerance.
          </p>
          <button
            onClick={() => generateMutation.mutate()}
            className="btn-primary"
          >
            <Sparkles className="w-4 h-4" />
            Generate Ideas
          </button>
        </div>
      )}

      {/* Grouped suggestion list */}
      {orderedCategories.map((cat) => (
        <section key={cat}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-gold uppercase tracking-wide">
              {CATEGORY_LABEL[cat]}
            </h2>
            <span className="text-xs text-text-muted">{grouped[cat].length}</span>
          </div>
          <div className="space-y-3">
            {grouped[cat].map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onAddToBench={() => benchAddMutation.mutate({
                  symbol: s.symbol,
                  name: s.name,
                  sector: s.category,
                })}
                onAddToPortfolio={() => setAddPositionFor(s)}
                onDismiss={() => dismissMutation.mutate(s.id)}
                busy={
                  dismissMutation.isPending ||
                  benchAddMutation.isPending
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
