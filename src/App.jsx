import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'

/**
 * Pass 1: All pages deleted. The app routes to a "Rebuilding..." placeholder
 * until Pass 3 brings the Dashboard online. Subsequent passes will reintroduce
 * Watchlist, Research, StockDetail, and Government.
 */
function Placeholder({ name }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-2xl font-serif text-ivory mb-2">{name}</h1>
        <p className="text-text-secondary">Rebuilding in progress.</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Placeholder name="Dashboard" />} />
        <Route path="watchlist" element={<Placeholder name="Watchlist" />} />
        <Route path="research" element={<Placeholder name="Research" />} />
        <Route path="government" element={<Placeholder name="Government" />} />
        <Route path="advisor" element={<Placeholder name="Advisor" />} />
      </Route>
    </Routes>
  )
}

export default App