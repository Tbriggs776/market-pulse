import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Info, X, ArrowRight } from 'lucide-react'

const DISMISS_KEY = 'market-pulse:guest-ribbon-dismissed'

export default function GuestRibbon() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true)
    } catch { /* sessionStorage may be unavailable */ }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* noop */ }
  }

  if (dismissed) return null

  return (
    <div className="bg-gold/5 border-b border-gold-dim/50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Info className="w-3.5 h-3.5 text-gold shrink-0" />
          <span>
            You're exploring as a guest.
            <Link to="/login" className="ml-1.5 text-gold hover:text-gold-bright font-medium inline-flex items-center gap-1">
              Sign in to save your watchlist, research, and conversations
              <ArrowRight className="w-3 h-3" />
            </Link>
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-text-muted hover:text-ivory transition-colors p-1"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}