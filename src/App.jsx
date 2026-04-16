import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Watchlist from './pages/Watchlist'

/**
 * Pass 4: Dashboard + Watchlist are real. Research, Government,
 * and Advisor still placeholders until their respective passes.
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
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="research" element={<Placeholder name="Research" />} />
        <Route path="government" element={<Placeholder name="Government" />} />
        <Route path="advisor" element={<Placeholder name="Advisor" />} />
      </Route>
    </Routes>
  )
}

export default App