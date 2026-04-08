import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'

/**
 * Pass 3: Dashboard is real. Other pages still placeholders until
 * their respective passes (Watchlist: Pass 4, Research: Pass 5,
 * Government: Pass 6, Advisor: Pass 7).
 */
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="watchlist" element={<Placeholder name="Watchlist" />} />
        <Route path="research" element={<Placeholder name="Research" />} />
        <Route path="government" element={<Placeholder name="Government" />} />
        <Route path="advisor" element={<Placeholder name="Advisor" />} />
      </Route>
    </Routes>
  )
}

export default App