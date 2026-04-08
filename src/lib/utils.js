// Format currency
export function formatCurrency(value, currency = 'USD') {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

// Format large numbers (market cap, volume)
export function formatLargeNumber(value) {
  if (value === null || value === undefined) return '-'

  if (value >= 1e12) {
    return `${(value / 1e12).toFixed(2)}T`
  }
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`
  }
  return value.toString()
}

// Format percentage
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined) return '-'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

// Format date
export function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Format date with time
export function formatDateTime(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Get color class based on value (positive/negative)
export function getChangeColor(value) {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-gray-600'
}

// Get background color class based on value
export function getChangeBgColor(value) {
  if (value > 0) return 'bg-green-100 text-green-800'
  if (value < 0) return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

// Debounce function
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Calculate portfolio metrics
export function calculatePortfolioMetrics(holdings) {
  if (!holdings || holdings.length === 0) {
    return {
      totalValue: 0,
      totalCost: 0,
      totalGain: 0,
      totalGainPercent: 0
    }
  }

  const totalValue = holdings.reduce((sum, h) => sum + (h.current_price * h.shares), 0)
  const totalCost = holdings.reduce((sum, h) => sum + (h.avg_cost * h.shares), 0)
  const totalGain = totalValue - totalCost
  const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

  return {
    totalValue,
    totalCost,
    totalGain,
    totalGainPercent
  }
}

// Class names helper
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
