import { Outlet, NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  Star,
  Search,
  Landmark,
  BrainCircuit,
  MapPin,
} from 'lucide-react'

/**
 * Market Pulse Layout
 * ────────────────────────────────────────────────────────────
 * Top nav structure (Base44-inspired, Veritas Ridge themed):
 *   [Logo]  [Dashboard | Watchlist | Research | Government | Advisor]  [Location | Theme]
 *
 * Brand wordmark uses Cinzel serif. Nav items sans. Active state
 * shows gold pill with gold-bright text. Below the nav, a 1px gold
 * gradient divider anchors the header band — the "institutional
 * letterhead" moment.
 *
 * Mobile: logo left, hamburger on the right (TODO Pass 3.5 —
 * for now the nav wraps and is usable on tablet+).
 */

const NAV_ITEMS = [
  { to: '/',           label: 'Dashboard',  icon: LayoutDashboard, end: true },
  { to: '/watchlist',  label: 'Watchlist',  icon: Star },
  { to: '/research',   label: 'Research',   icon: Search },
  { to: '/government', label: 'Government', icon: Landmark },
  { to: '/advisor',    label: 'Advisor',    icon: BrainCircuit },
]

function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-3 group">
      {/* Mountain glyph — abstracted from the Veritas Ridge logo mark.
          Pure SVG so it scales cleanly and takes our gold token. */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        className="text-gold group-hover:text-gold-bright transition-colors"
        aria-hidden="true"
      >
        <path
          d="M2 26 L11 10 L16 18 L21 8 L30 26 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
      <span className="font-serif text-xl tracking-wider text-gold group-hover:text-gold-bright transition-colors">
        MARKET&nbsp;PULSE
      </span>
    </Link>
  )
}

function LocationPill() {
  // TODO Pass 3.5: geolocate + state selector dropdown.
  // For now: static Arizona badge.
  return (
    <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-text-secondary">
      <MapPin className="w-3 h-3 text-gold" aria-hidden="true" />
      <span>Arizona</span>
    </div>
  )
}

export default function Layout() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* ─── Header band ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: brand */}
            <BrandMark />

            {/* Center: nav */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gold/10 text-gold-bright'
                        : 'text-text-secondary hover:text-ivory hover:bg-surface-elevated'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              <LocationPill />
              {/* Theme toggle goes here in a later pass */}
            </div>
          </div>
        </div>

        {/* Gold gradient divider — the institutional letterhead accent */}
        <div className="gold-divider" />
      </header>

      {/* ─── Main content ───────────────────────────────────── */}
      <main>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <Outlet />
        </div>
      </main>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <span className="font-serif text-gold">MARKET PULSE</span>
              <span>·</span>
              <span>A Veritas Ridge research tool</span>
            </div>
            <div>
              <span>Not investment advice. Educational purposes only.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}