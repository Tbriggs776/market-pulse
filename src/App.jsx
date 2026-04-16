import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Watchlist from './pages/Watchlist'
import Research from './pages/Research'
import Government from './pages/Government'
import Advisor from './pages/Advisor'
import Login from './pages/Login'
import { RefreshCw } from 'lucide-react'

function Placeholder({ name }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="font-serif text-3xl tracking-wide text-ivory mb-2">
          {name}
        </h1>
        <p className="text-text-secondary">Rebuilding in progress.</p>
      </div>
    </div>
  )
}

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
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="research" element={<Research />} />
        <Route path="government" element={<Government />} />
        <Route path="advisor" element={<Advisor />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
