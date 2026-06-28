import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { RefreshCw, Newspaper, MapPin, Flag, Briefcase, Globe, Lightbulb, ArrowRight, Sparkles } from 'lucide-react'
import { newsService } from '../lib/api'
import NewsCard from '../components/news/NewsCard'
import NewsCardSkeleton from '../components/news/NewsCardSkeleton'
import AIBriefing from '../components/dashboard/AIBriefing'
import { useAuth } from '../contexts/AuthContext'
import { useAnonymousStore } from '../contexts/AnonymousStoreContext'
import { investmentRulesApi } from '../lib/supabase'

const TABS = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'local', label: 'Local', icon: MapPin },
  { id: 'national', label: 'National', icon: Flag },
  { id: 'business', label: 'Business', icon: Briefcase },
]

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('all')
  const { profile } = useAuth()
  const { isAnonymous } = useAuth()
  const { state: anonState, watchlist: anonWatchlist, transactions: anonTransactions } = useAnonymousStore()
  const state = isAnonymous ? anonState : (profile?.state || 'Arizona')

  // Guests have no server-side portfolio -- hand the curator their session
  // watchlist + transactions so it has something to anchor relevance on.
  const anonymousContext = isAnonymous
    ? { watchlist: anonWatchlist, transactions: anonTransactions }
    : null

  const {
    data: news,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    // Re-curate when the guest's session portfolio changes; authed users are
    // read server-side, so state + a manual refresh is enough.
    queryKey: [
      'news-curated',
      state,
      isAnonymous ? `anon:${anonWatchlist.length}:${anonTransactions.length}` : 'auth',
    ],
    queryFn: () => newsService.fetchCurated({ state, anonymousContext }),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Show the "For You" lens only when the curator actually produced relevant hits.
  const hasForYou = Boolean(news?.curated && news?.forYou?.length > 0)

  // Build the tab list: For You (when available) -> All -> Local -> National -> Business.
  const tabs = [
    ...(hasForYou ? [{ id: 'forYou', label: 'For You', icon: Sparkles }] : []),
    ...TABS.map((t) => (t.id === 'local' ? { ...t, label: state } : t)),
  ]

  // If the active tab disappears (e.g. For You emptied out), fall back to All.
  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'all'

  const displayArticles = news
    ? resolvedTab === 'all'
      ? news.all
      : news[resolvedTab] || []
    : []

  // Investment Rules CTA: only authed, only when rules aren't completed.
  const { data: rules } = useQuery({
    queryKey: ['investment-rules'],
    queryFn: investmentRulesApi.get,
    enabled: !isAnonymous,
    staleTime: 60 * 1000,
  })
  const showRulesCta = !isAnonymous && rules && rules.onboarding_status !== 'completed'

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-wide text-ivory mb-1">
            Daily Briefing
          </h1>
          <p className="text-sm text-text-secondary">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary self-start"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      {showRulesCta && (
        <Link
          to="/profile"
          className="card-elevated border-gold/30 bg-gold/5 flex items-start sm:items-center gap-3 sm:gap-4 hover:border-gold transition-colors"
        >
          <div className="p-2 rounded bg-gold/10 shrink-0">
            <Lightbulb className="w-5 h-5 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ivory">
              Set your Investment Rules
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
              About a minute. Unlocks AI-curated suggestions and gives the advisor real context for your goals.
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gold shrink-0" />
        </Link>
      )}

      <AIBriefing articles={news?.all || []} state={state} />

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-ivory">
            <Newspaper className="w-5 h-5 text-gold" aria-hidden="true" />
            Latest News
          </h2>
          <div
            className="flex items-center gap-1 p-1 bg-surface rounded-md border border-border overflow-x-auto max-w-full"
            role="tablist"
            aria-label="News categories"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={resolvedTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  resolvedTab === tab.id
                    ? 'bg-gold/15 text-gold-bright'
                    : 'text-text-secondary hover:text-ivory'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="card border-crimson/30 mb-4">
            <div className="text-crimson text-sm">
              Unable to load news. Try refreshing.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <NewsCardSkeleton key={i} />
              ))
            : displayArticles.length > 0
              ? displayArticles.slice(0, 12).map((article) => (
                  <NewsCard key={article.id} article={article} />
                ))
              : (
                <div className="col-span-full card text-center py-12">
                  <Newspaper
                    className="w-10 h-10 text-text-muted mx-auto mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-text-secondary">
                    No articles in this category right now.
                  </p>
                </div>
              )}
        </div>
      </section>
    </div>
  )
}