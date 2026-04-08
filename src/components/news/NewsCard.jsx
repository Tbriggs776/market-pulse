import { ExternalLink } from 'lucide-react'

/**
 * NewsCard — one article in the Dashboard news grid.
 *
 * Design notes:
 *  • Dark surface with gold accent on the source label
 *  • Image is optional; no-image version is still balanced
 *  • Clicking anywhere on the card opens the article in a new tab
 *  • Category badge bottom-left, relative time bottom-right
 *  • Hover state: subtle border glow in gold-dim
 */

const CATEGORY_STYLES = {
  local: 'badge-gold',
  national: 'badge-patriot',
  business: 'badge-positive',
}

const CATEGORY_LABELS = {
  local: 'Local',
  national: 'National',
  business: 'Business',
}

/**
 * Format an ISO timestamp as a relative time string.
 *   "just now" | "15m ago" | "3h ago" | "2d ago"
 * Anything older than 7 days falls back to date.
 */
function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function NewsCard({ article }) {
  if (!article) return null

  const categoryClass = CATEGORY_STYLES[article.category] || 'badge-neutral'
  const categoryLabel = CATEGORY_LABELS[article.category] || article.category

  return (
    
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card group flex flex-col hover:border-gold-dim transition-colors no-underline"
    >
      {/* Image, if present */}
      {article.imageUrl && (
        <div className="relative -mx-5 -mt-5 mb-4 aspect-video overflow-hidden rounded-t-lg bg-surface-elevated">
          <img
            src={article.imageUrl}
            alt=""
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            loading="lazy"
            onError={(e) => {
              // If the image 404s, hide the container rather than show broken-image icon
              e.currentTarget.parentElement.style.display = 'none'
            }}
          />
          {/* Subtle vignette for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-canvas/40 to-transparent pointer-events-none" />
        </div>
      )}

      {/* Source */}
      <div className="text-xs font-medium text-gold tracking-wide uppercase mb-2">
        {article.source}
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-ivory mb-2 leading-snug group-hover:text-gold-bright transition-colors">
        {article.title}
      </h3>

      {/* Description */}
      {article.description && (
        <p className="text-sm text-text-secondary leading-relaxed mb-4 line-clamp-3">
          {article.description}
        </p>
      )}

      {/* Ticker pills — shown only if newsdata.io's ai_tag surfaced any */}
      {article.tickers && article.tickers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {article.tickers.map((ticker) => (
            <span
              key={ticker}
              className="badge-gold font-mono text-[10px] px-1.5 py-0"
            >
              {ticker}
            </span>
          ))}
        </div>
      )}

      {/* Footer: category + time + external link icon */}
      <div className="mt-auto pt-3 border-t border-border flex items-center justify-between">
        <span className={categoryClass}>{categoryLabel}</span>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>{relativeTime(article.publishedAt)}</span>
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </div>
      </div>
    </a>
  )
}