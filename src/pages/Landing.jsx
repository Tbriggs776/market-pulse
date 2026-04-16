import { Link } from 'react-router-dom'
import {
  Sparkles, TrendingUp, Landmark, Search, Bot,
  ArrowRight, BarChart3, Shield, Zap,
} from 'lucide-react'

function GoldMountain({ size = 48 }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" width={size} height={size} className="text-gold" aria-hidden="true">
      <path d="M14 3L4 24h6l4-10 4 10h6L14 3z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GoldMountain size={28} />
            <span className="font-serif text-sm tracking-[0.25em] text-gold font-semibold">
              MARKET PULSE
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-sm text-text-secondary hover:text-ivory transition-colors">
              See inside
            </Link>
            <Link to="/login" className="btn-primary text-xs px-4 py-1.5">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="grid md:grid-cols-[1.2fr_1fr] gap-16 items-center">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="h-px w-12 bg-gold-dim" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold">A Veritas Ridge Research Tool</span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] text-ivory mb-6 tracking-tight">
              The market, through a <span className="text-gold">CFO's lens.</span>
            </h1>
            <p className="text-lg text-text-secondary leading-relaxed mb-8 max-w-xl">
              Live federal fiscal data, macro indicators, equity research, and an AI advisor that knows your portfolio. Built for operators and investors who want institutional-grade signal without the institutional-grade platform bill.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/dashboard" className="btn-primary flex items-center gap-2">
                Enter Market Pulse
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="btn-ghost">
                Sign in to save
              </Link>
            </div>
            <p className="text-xs text-text-muted mt-4">
              Free to explore. Sign in to save your watchlist, research, and advisor conversations.
            </p>
          </div>

          {/* Hero card: simulated advisor exchange */}
          <div className="card-elevated p-5 border-gold-dim">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              <Bot className="w-4 h-4 text-gold" />
              <span className="text-xs font-medium text-gold-bright">Market Pulse Advisor</span>
              <span className="ml-auto text-[10px] text-text-muted font-mono">Sonnet 4.6</span>
            </div>
            <div className="space-y-4 text-sm">
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-gold/10 border border-gold-dim rounded-lg px-3 py-2 text-xs text-ivory">
                  Compare NVDA and AMD for me.
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="shrink-0 w-6 h-6 rounded-full bg-gold/10 border border-gold-dim flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-gold" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-surface border border-border rounded text-[10px] text-text-secondary font-mono w-fit">
                    <Zap className="w-2.5 h-2.5 text-gold" />
                    Quote NVDA, AMD
                  </div>
                  <div className="text-xs text-ivory leading-relaxed">
                    <strong className="text-gold-bright">NVDA</strong> sits at $198.87 on 185M volume. <strong className="text-gold-bright">AMD</strong> at $258.12, 24.7M. NVDA owns training infrastructure &mdash; AMD is the challenger narrative in inference...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value props / feature tour */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-12 bg-gold-dim" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-gold">What's inside</span>
          </div>
          <h2 className="font-serif text-3xl text-ivory">Four lenses, one research tool.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <FeatureCard
            icon={BarChart3}
            title="Dashboard"
            description="AI-synthesized morning briefing, tabbed news feed (local, national, business), and macro context. Claude reads the headlines so you can read the analysis."
            href="/dashboard"
            cta="Open Dashboard"
          />
          <FeatureCard
            icon={Bot}
            title="The Advisor"
            description="Portfolio-aware AI that can fetch live quotes, run research dossiers, check macro, and search news mid-conversation. Sonnet 4.6 default; Opus 4.7 when you want deeper reasoning."
            href="/advisor"
            cta="Talk to the Advisor"
            accent
          />
          <FeatureCard
            icon={Search}
            title="Research"
            description="Instant Claude-generated investment theses on any ticker. Company fundamentals, 30-day price action, bull/bear cases, and positioning views."
            href="/research"
            cta="Research a Ticker"
          />
          <FeatureCard
            icon={Landmark}
            title="Government & Fiscal"
            description="Live federal debt, monthly fiscal statements (Income, Balance, Cash Flow), $10T+ in spending by budget function, and sub-agency execution grades from Claude."
            href="/government"
            cta="Open Fiscal View"
          />
        </div>
      </section>

      {/* Why sign in */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-border">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-12 items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px w-12 bg-gold-dim" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-gold">Free to explore</span>
            </div>
            <h2 className="font-serif text-3xl text-ivory mb-4">Sign in to make it yours.</h2>
            <p className="text-text-secondary leading-relaxed mb-6">
              Everything on Market Pulse is readable as a guest. Signing in unlocks persistence &mdash; your research, your positions, your conversations with the Advisor, all available across sessions and devices.
            </p>
            <Link to="/login" className="btn-primary inline-flex items-center gap-2">
              Create an account
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid gap-3">
            <SavedFeatureRow title="Watchlist" description="Track unlimited tickers with live prices and P&amp;L since added" />
            <SavedFeatureRow title="Research Bench" description="Stage tickers you're evaluating with status tags and notes" />
            <SavedFeatureRow title="Advisor conversations" description="Full conversation history, searchable and resumable" />
            <SavedFeatureRow title="Cross-device sync" description="Same portfolio on phone, tablet, and desktop" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-serif text-[10px] tracking-[0.2em] text-gold/60">MARKET PULSE</span>
            <span className="text-border">|</span>
            <span>A Veritas Ridge research tool</span>
          </div>
          <span>Not investment advice. Educational purposes only.</span>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description, href, cta, accent = false }) {
  return (
    <Link
      to={href}
      className={`card-elevated p-6 group hover:border-gold-dim transition-colors ${accent ? 'border-gold-dim' : ''}`}
    >
      <div className="flex items-start gap-4 mb-3">
        <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${accent ? 'bg-gold/15 border border-gold-dim' : 'bg-surface'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-gold' : 'text-gold-bright'}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-serif text-xl text-ivory mb-1">{title}</h3>
        </div>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed mb-4">{description}</p>
      <div className="flex items-center gap-1 text-xs text-gold group-hover:text-gold-bright transition-colors">
        <span>{cta}</span>
        <ArrowRight className="w-3 h-3" />
      </div>
    </Link>
  )
}

function SavedFeatureRow({ title, description }) {
  return (
    <div className="card flex items-start gap-3">
      <Shield className="w-4 h-4 text-gold shrink-0 mt-0.5" />
      <div>
        <div className="text-sm text-ivory font-medium">{title}</div>
        <div className="text-xs text-text-secondary leading-relaxed">{description}</div>
      </div>
    </div>
  )
}