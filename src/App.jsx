import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AnonymousStoreProvider } from './contexts/AnonymousStoreContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Watchlist from './pages/Watchlist'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'
import Research from './pages/Research'
import Government from './pages/Government'
import Advisor from './pages/Advisor'
import Login from './pages/Login'
import Landing from './pages/Landing'
import { RefreshCw } from 'lucide-react'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas">
        <RefreshCw className="w-6 h-6 text-gold animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      {/* Marketing homepage */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Public routes: Layout without ProtectedRoute */}
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/research" element={<Research />} />
        <Route path="/government" element={<Government />} />
        <Route path="/advisor" element={<Advisor />} />
      </Route>

      {/* Gated routes */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/transactions" element={<Transactions />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AnonymousStoreProvider>
        <AppRoutes />
      </AnonymousStoreProvider>
    </AuthProvider>
  )
}

export default App