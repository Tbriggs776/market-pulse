import { Link } from 'react-router-dom'
import { Lock, ArrowRight, X } from 'lucide-react'

/**
 * Modal shown when anonymous user hits a gate.
 * Props: open (bool), onClose (fn), title, body, footer (optional React node)
 */
export default function SignInPrompt({ open, onClose, title, body, footer = null }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card-elevated border-gold-dim max-w-md w-full relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-text-muted hover:text-ivory p-1 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4 mb-5">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-gold/10 border border-gold-dim flex items-center justify-center">
            <Lock className="w-5 h-5 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-xl text-ivory mb-2">{title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
          </div>
        </div>

        {footer && (
          <div className="mb-5 pb-5 border-b border-border">
            {footer}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Link to="/login" className="btn-primary flex-1 justify-center inline-flex items-center gap-2">
            Sign up
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}