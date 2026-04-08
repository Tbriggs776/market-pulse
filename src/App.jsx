import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Research from './pages/Research'
import StockDetail from './pages/StockDetail'
import Watchlist from './pages/Watchlist'
import Portfolio from './pages/Portfolio'
import Government from './pages/Government'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="research" element={<Research />} />
        <Route path="stock/:ticker" element={<StockDetail />} />
        <Route path="watchlist" element={<Watchlist />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="government" element={<Government />} />
      </Route>
    </Routes>
  )
}

export default App
