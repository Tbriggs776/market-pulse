import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import { LogIn, UserPlus, RefreshCw, AlertTriangle } from 'lucide-react'

export default function Login() {
  const { user, signIn, signUp, loading } = useAuth()
  const [mode, setMode] = useState('login') // 'login' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)

  // If already logged in, redirect to dashboard
  if (!loading && user) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password, displayName)
        setSignupSuccess(true)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas">
        <RefreshCw className="w-6 h-6 text-gold animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl tracking-widest text-gold mb-2">
            MARKET PULSE
          </h1>
          <p className="text-sm text-text-secondary">
            A Veritas Ridge research tool
          </p>
        </div>

        {/* Signup success message */}
        {signupSuccess && (
          <div className="card-elevated border-positive/30 mb-6">
            <div className="text-sm text-positive">
              Account created! Check your email to confirm, then sign in.
            </div>
          </div>
        )}

        {/* Form card */}
        <div className="card-elevated">
          {/* Tab toggle */}
          <div className="flex mb-6 border-b border-border">
            <button
              onClick={() => { setMode('login'); setError(''); setSignupSuccess(false) }}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'text-gold border-b-2 border-gold'
                  : 'text-text-muted hover:text-ivory'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setSignupSuccess(false) }}
              className={`flex-1 pb-3 text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'text-gold border-b-2 border-gold'
                  : 'text-text-muted hover:text-ivory'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tyler Briggs"
                  className="input w-full"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-text-secondary mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tyler@veritasridge.com"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="input w-full"
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-crimson text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-text-muted mt-6">
          Not investment advice. Educational purposes only.
        </p>
      </div>
    </div>
  )
}