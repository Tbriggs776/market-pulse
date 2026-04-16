import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Star, Search, Landmark, Bot,
  MapPin, LogOut
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/watchlist', label: 'Watchlist', icon: Star },
  { to: '/research', label: 'Research', icon: Search },
  { to: '/government', label: 'Government', icon: Landmark },
  { to: '/advisor', label: 'Advisor', icon: Bot },
]

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        viewBox="0 0 28 28"
        fill="none"
        className="w-7 h-7 text-gold"
        aria-hidden="true"
      >
        <path
          d="M14 3L4 24h6l4-10 4 10h6L14 3z"
          fill="currentColor"
          opacity="0.9"
        />
      </svg>
      <span className="font-serif text-sm tracking-[0.25em] text-gold font-semibold">
        MARKET PULSE
      </span>
    </div>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const userState = profile?.state || 'Arizona'
  const displayName = profile?.display_name || profile?.email || ''

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <BrandMark />

          <nav className="hidden md:flex items-center gap-1" role="navigation">
            {NAV_ITEMS.map((item) => (
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

          <div className="flex items-center gap-3">
            {/* Location pill */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full border border-border text-xs text-text-secondary">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              <span>{userState}</span>
            </div>

            {/* User menu */}
            {displayName && (
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
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-text-muted">
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