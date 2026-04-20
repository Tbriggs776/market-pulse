import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Star, Search, Landmark, Bot, PieChart, Receipt,
  LogOut, LogIn, Menu, X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import GuestRibbon from './GuestRibbon'
import StatePicker from './StatePicker'

const NAV_ITEMS_AUTHED = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: PieChart },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/research', label: 'Research', icon: Search },
  { to: '/government', label: 'Government', icon: Landmark },
  { to: '/advisor', label: 'Advisor', icon: Bot },
]

const NAV_ITEMS_ANON = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/research', label: 'Research', icon: Search },
  { to: '/government', label: 'Government', icon: Landmark },
  { to: '/advisor', label: 'Advisor', icon: Bot },
]

function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <svg
        viewBox="0 0 28 28"
        fill="none"
        className="w-7 h-7 text-gold"
        aria-hidden="true"
      >
        <path d="M14 3L4 24h6l4-10 4 10h6L14 3z" fill="currentColor" opacity="0.9" />
      </svg>
      <span className="font-serif text-sm tracking-[0.25em] text-gold font-semibold group-hover:text-gold-bright transition-colors">
        MARKET PULSE
      </span>
    </Link>
  )
}

export default function Layout() {
  const { profile, signOut, isAnonymous } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const displayName = profile?.display_name || profile?.email || ''

  // Auto-close mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const navItems = isAnonymous ? NAV_ITEMS_ANON : NAV_ITEMS_AUTHED

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <BrandMark />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" role="navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-gold bg-gold/10'
                      : 'text-text-secondary hover:text-ivory hover:bg-surface'
                  }`
                }
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block"><StatePicker /></div>

            {isAnonymous ? (
              <Link to="/login" className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 shrink-0">
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign in</span>
              </Link>
            ) : (
              displayName && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted hidden lg:inline">
                    {displayName}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="btn-ghost p-1.5"
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )
            )}

            {/* Hamburger -- mobile only */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden btn-ghost p-2"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-canvas/95 backdrop-blur">
            <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1" role="navigation">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-gold bg-gold/10'
                        : 'text-text-secondary hover:text-ivory hover:bg-surface'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              {/* State picker on mobile lives in the drawer */}
              <div className="sm:hidden pt-3 mt-1 border-t border-border flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-wide text-text-muted px-3">Your state</span>
                <StatePicker />
              </div>
            </nav>
          </div>
        )}
      </header>

      {isAnonymous && <GuestRibbon />}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-serif text-[10px] tracking-[0.2em] text-gold/60">
              MARKET PULSE
            </span>
            <span className="text-border">|</span>
            <span>A Veritas Ridge research tool</span>
          </div>
          <span>Not investment advice. Educational purposes only.</span>
        </div>
      </footer>
    </div>
  )
}