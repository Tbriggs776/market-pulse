import { useQuery } from '@tanstack/react-query'
import { Newspaper, Sparkles, AlertCircle, RefreshCw } from 'lucide-react'
import { aiService } from '../../lib/api'

/**
 * AIBriefing — Claude-generated daily briefing card.
 *
 * Lives at the top of the Dashboard below the header. Consumes the
 * already-fetched news articles (passed in as a prop) rather than
 * re-fetching — the Dashboard's useQuery already has them and we
 * want them to share cache state.
 *
 * States:
 *  • articles empty / news loading → "Preparing briefing..." skeleton
 *  • briefing loading → pulsing gold border, Sparkles icon
 *  • briefing ready → rendered prose in text-ivory, gold "AI BRIEFING"
 *    label, timestamp and model name in footer
 *  • briefing error → dim crimson border, error text, Retry button
 */

function paragraphs(text) {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export default function AIBriefing({ articles, state = 'Arizona' }) {
  const hasArticles = Array.isArray(articles) && articles.length > 0

  // Cache key derived from article IDs. If news refreshes with same
  // content, the briefing query returns cached. If content changes,
  // it regenerates automatically.
  const articleKey = hasArticles
    ? articles.slice(0, 15).map((a) => a.id).join('|')
    : 'empty'

  const {
    data: briefing,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['briefing', articleKey, state],
    queryFn: () => aiService.generateBriefing(articles, state),
    enabled: hasArticles,
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 2 * 60 * 60 * 1000, // 2 hr
    refetchOnWindowFocus: false,
    retry: 1,
  })

  if (!hasArticles) {
    return (
      <BriefingFrame>
        <div className="text-sm text-text-muted italic">
          Waiting for today's stories…
        </div>
      </BriefingFrame>
    )
  }

  if (isLoading) {
    return (
      <BriefingFrame loading>
        <div className="space-y-2">
          <div className="h-3 bg-surface-elevated rounded animate-pulse w-11/12" />
          <div className="h-3 bg-surface-elevated rounded animate-pulse w-10/12" />
          <div className="h-3 bg-surface-elevated rounded animate-pulse w-full" />
          <div className="h-3 bg-surface-elevated rounded animate-pulse w-9/12" />
        </div>
        <div className="mt-3 text-xs text-text-muted">
          Synthesizing {articles.length} stories…
        </div>
      </BriefingFrame>
    )
  }

  if (error) {
    return (
      <BriefingFrame errored>
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-crimson shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm text-ivory mb-1">
              Briefing unavailable
            </div>
            <div className="text-xs text-text-secondary mb-3">
              {error.message || 'The briefing service returned an error.'}
            </div>
            <button
              onClick={() => refetch()}
              className="btn-ghost text-xs"
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      </BriefingFrame>
    )
  }

  return (
    <BriefingFrame>
      <div className="prose-briefing text-sm">
        {paragraphs(briefing.briefing).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
        <span>
          Generated{' '}
          {briefing.generatedAt
            ? new Date(briefing.generatedAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })
            : ''}
        </span>
        <div className="flex items-center gap-2">
          {isFetching && (
            <RefreshCw
              className="w-3 h-3 animate-spin"
              aria-hidden="true"
            />
          )}
          <span className="font-mono">{briefing.model}</span>
        </div>
      </div>
    </BriefingFrame>
  )
}

function BriefingFrame({ children, loading = false, errored = false }) {
  const borderClass = errored
    ? 'border-crimson/30'
    : loading
      ? 'border-gold/40 animate-pulse'
      : 'border-gold/20'

  return (
    <div className={`card-elevated ${borderClass}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gold/10 rounded-md shrink-0">
          {loading ? (
            <Sparkles className="w-5 h-5 text-gold" aria-hidden="true" />
          ) : (
            <Newspaper className="w-5 h-5 text-gold" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gold uppercase tracking-wide mb-2">
            AI Briefing
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
