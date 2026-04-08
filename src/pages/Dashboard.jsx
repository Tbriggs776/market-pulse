import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Newspaper, MapPin, Flag, Briefcase, Globe } from 'lucide-react'
import { newsService } from '../lib/api'
import NewsCard from '../components/news/NewsCard'
import NewsCardSkeleton from '../components/news/NewsCardSkeleton'

/**
 * Dashboard
 * ────────────────────────────────────────────────────────────
 * Pass 3 scope: news-only. The full vision includes a market-movers
 * grid and an AI-generated daily briefing at the top — those land in
 * Pass 3B and 3C. Today we prove the service pattern end-to-end
 * with the lowest-risk API (NewsAPI).
 *
 * State:
 *  • activeTab: 'all' | 'local' | 'national' | 'business'
 *  • TanStack Query handles caching, refetching, loading states
 *
 * The user's state is Arizona (hardcoded for now — state selector
 * comes in Pass 3.5).
 */

const TABS = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'local', label: 'Arizona', icon: MapPin },
  { id: 'national', label: 'National', icon: Flag },
  { id: 'business', label: 'Business', icon: Briefcase },
]

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('all')
  const state = 'Arizona' // TODO Pass 3.5: pull from user profile / geolocation

  const {
    data: news,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['news', state],
    queryFn: () => newsService.fetchAll({ state }),
    // News staleness: fresh for 10 minutes, cached up to 1 hour.
    // Aggressive caching is deliberate — NewsAPI free tier is 100/day
    // and we don't want every page visit to burn a request.
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const displayArticles = news
    ? activeTab === 'all'
      ? news.all
      : news[activeTab] || []
    : []

  return (
    <div className="space-y-8">
      {/* ─── Header ─────────────────────────────────────────── */}
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

      {/* ─── AI Briefing placeholder ─────────────────────────── */}
      {/* Will be replaced in Pass 3B with a Claude-generated summary
          that digests today's news + market data. For now: a deliberate
          placeholder that signals what's coming. */}
      <div className="card-elevated border-gold/20">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-gold/10 rounded-md">
            <Newspaper className="w-5 h-5 text-gold" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-gold uppercase tracking-wide mb-1">
              AI Briefing
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Claude-generated daily summary will appear here in the next pass.
              It will synthesize today's top stories across local, national,
              and business coverage with relevance to your watchlist and
              current macro conditions.
            </p>
          </div>
        </div>
      </div>

      {/* ─── News section ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-ivory">
            <Newspaper className="w-5 h-5 text-gold" aria-hidden="true" />
            Latest News
          </h2>

          {/* Tabs */}
          <div
            className="flex items-center gap-1 p-1 bg-surface rounded-md border border-border"
            role="tablist"
            aria-label="News categories"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  activeTab === tab.id
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

        {/* Error state (soft — news service never throws, but defensive) */}
        {error && (
          <div className="card border-crimson/30 mb-4">
            <div className="text-crimson text-sm">
              Unable to load news. Try refreshing.
            </div>
          </div>
        )}

        {/* Grid */}
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
                  <p className="text-xs text-text-muted mt-1">
                    NewsAPI free tier is localhost-only. If you're on a
                    deployed URL, the news service is blocked until we move it
                    server-side.
                  </p>
                </div>
              )}
        </div>
      </section>
    </div>
  )
}