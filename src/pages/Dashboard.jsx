import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Newspaper, MapPin, Flag, Briefcase, Globe } from 'lucide-react'
import { newsService } from '../lib/api'
import NewsCard from '../components/news/NewsCard'
import NewsCardSkeleton from '../components/news/NewsCardSkeleton'
import AIBriefing from '../components/dashboard/AIBriefing'

/**
 * Dashboard
 * ----------------------------------------------------------
 * Pass 3 + 3B scope: news + AI briefing. Market movers come
 * in Pass 3C. The user's state is Arizona (hardcoded for now
 * until Pass 3.5 brings geolocation + state selector).
 */

const TABS = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'local', label: 'Arizona', icon: MapPin },
  { id: 'national', label: 'National', icon: Flag },
  { id: 'business', label: 'Business', icon: Briefcase },
]

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('all')
  const state = 'Arizona' // TODO Pass 3.5: user profile / geolocation

  const {
    data: news,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['news', state],
    queryFn: () => newsService.fetchAll({ state }),
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
      {/* Header */}
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

      {/* AI Briefing */}
      <AIBriefing articles={news?.all || []} state={state} />

      {/* News section */}
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

        {/* Error state */}
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
                </div>
              )}
        </div>
      </section>
    </div>
  )
}