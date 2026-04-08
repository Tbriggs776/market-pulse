/**
 * Market Pulse Backtest Engine
 * Advanced portfolio backtesting with macro regime analysis
 */

// =============================================================================
// HISTORICAL SEED DATA
// =============================================================================

// Monthly returns by ticker (2010-2024, simplified seed data)
// Format: { ticker: { 'YYYY-MM': monthlyReturn } }
const HISTORICAL_MONTHLY_RETURNS = {
  AAPL: generateSectorReturns('Technology', 0.018, 0.08),
  MSFT: generateSectorReturns('Technology', 0.016, 0.07),
  JNJ: generateSectorReturns('Healthcare', 0.009, 0.04),
  PG: generateSectorReturns('Consumer Staples', 0.008, 0.035),
  KO: generateSectorReturns('Consumer Staples', 0.007, 0.03),
  PEP: generateSectorReturns('Consumer Staples', 0.008, 0.032),
  MCD: generateSectorReturns('Consumer Discretionary', 0.011, 0.045),
  WMT: generateSectorReturns('Consumer Staples', 0.007, 0.035),
  HD: generateSectorReturns('Consumer Discretionary', 0.014, 0.055),
  LOW: generateSectorReturns('Consumer Discretionary', 0.013, 0.06),
  CSCO: generateSectorReturns('Technology', 0.010, 0.05),
  VZ: generateSectorReturns('Communication Services', 0.005, 0.04),
  T: generateSectorReturns('Communication Services', 0.003, 0.045),
  IBM: generateSectorReturns('Technology', 0.004, 0.05),
  INTC: generateSectorReturns('Technology', 0.006, 0.065),
  MMM: generateSectorReturns('Industrials', 0.006, 0.045),
  ABT: generateSectorReturns('Healthcare', 0.011, 0.04),
  ABBV: generateSectorReturns('Healthcare', 0.012, 0.05),
  CVX: generateSectorReturns('Energy', 0.008, 0.07),
  XOM: generateSectorReturns('Energy', 0.007, 0.065)
}

// Dividend yields by ticker (annual, simplified)
const HISTORICAL_DIVIDEND_YIELDS = {
  AAPL: 0.006, MSFT: 0.008, JNJ: 0.026, PG: 0.024, KO: 0.030,
  PEP: 0.027, MCD: 0.022, WMT: 0.015, HD: 0.023, LOW: 0.018,
  CSCO: 0.030, VZ: 0.065, T: 0.070, IBM: 0.045, INTC: 0.025,
  MMM: 0.035, ABT: 0.018, ABBV: 0.040, CVX: 0.038, XOM: 0.035
}

// =============================================================================
// MACRO REGIME DEFINITIONS
// =============================================================================

const MACRO_REGIMES = {
  LowRate: {
    name: 'Low Rate Environment',
    period: '2010-2015',
    startYear: 2010,
    endYear: 2015,
    characteristics: {
      fedFundsRate: 0.25,
      inflation: 1.5,
      tenYearYield: 2.2,
      marketVolatility: 'Low',
      vixAverage: 15,
      gdpGrowth: 2.2,
      unemploymentTrend: 'Declining'
    },
    sectorPerformance: {
      Technology: 'Outperform',
      Healthcare: 'Outperform',
      'Consumer Staples': 'Market Perform',
      'Consumer Discretionary': 'Outperform',
      'Communication Services': 'Underperform',
      Industrials: 'Market Perform',
      Energy: 'Underperform'
    },
    dividendSafety: 'High',
    description: 'Post-GFC recovery with near-zero rates. QE programs support asset prices. Dividend stocks attractive for yield-seeking investors.'
  },

  RisingRate: {
    name: 'Rising Rate Environment',
    period: '2015-2018',
    startYear: 2015,
    endYear: 2018,
    characteristics: {
      fedFundsRate: 1.75,
      inflation: 2.0,
      tenYearYield: 2.8,
      marketVolatility: 'Moderate',
      vixAverage: 14,
      gdpGrowth: 2.5,
      unemploymentTrend: 'Low'
    },
    sectorPerformance: {
      Technology: 'Outperform',
      Healthcare: 'Market Perform',
      'Consumer Staples': 'Underperform',
      'Consumer Discretionary': 'Outperform',
      'Communication Services': 'Market Perform',
      Industrials: 'Outperform',
      Energy: 'Underperform'
    },
    dividendSafety: 'Moderate',
    description: 'Fed normalization cycle. Gradual rate hikes pressure bond proxies. Growth stocks lead, dividend growers preferred over high yielders.'
  },

  HighRate: {
    name: 'High Rate / Pre-COVID',
    period: '2018-2020',
    startYear: 2018,
    endYear: 2020,
    characteristics: {
      fedFundsRate: 2.25,
      inflation: 2.2,
      tenYearYield: 3.0,
      marketVolatility: 'High',
      vixAverage: 20,
      gdpGrowth: 2.3,
      unemploymentTrend: 'Stable Low'
    },
    sectorPerformance: {
      Technology: 'Market Perform',
      Healthcare: 'Outperform',
      'Consumer Staples': 'Outperform',
      'Consumer Discretionary': 'Market Perform',
      'Communication Services': 'Market Perform',
      Industrials: 'Underperform',
      Energy: 'Underperform'
    },
    dividendSafety: 'Moderate',
    description: 'Peak fed funds rate before COVID. Trade tensions create volatility. Defensive dividend payers gain favor.'
  },

  EasyMoney: {
    name: 'Easy Money / COVID Era',
    period: '2020-2022',
    startYear: 2020,
    endYear: 2022,
    characteristics: {
      fedFundsRate: 0.10,
      inflation: 4.5,
      tenYearYield: 1.5,
      marketVolatility: 'Very High',
      vixAverage: 25,
      gdpGrowth: -1.5,
      unemploymentTrend: 'Spike then Decline'
    },
    sectorPerformance: {
      Technology: 'Outperform',
      Healthcare: 'Outperform',
      'Consumer Staples': 'Market Perform',
      'Consumer Discretionary': 'Outperform',
      'Communication Services': 'Outperform',
      Industrials: 'Underperform',
      Energy: 'Underperform'
    },
    dividendSafety: 'Variable',
    description: 'Emergency rate cuts and massive QE. Dividend cuts in cyclicals. Tech and healthcare dividends stable.'
  },

  Tightening: {
    name: 'Aggressive Tightening',
    period: '2022-2024',
    startYear: 2022,
    endYear: 2024,
    characteristics: {
      fedFundsRate: 5.25,
      inflation: 6.0,
      tenYearYield: 4.5,
      marketVolatility: 'High',
      vixAverage: 22,
      gdpGrowth: 1.8,
      unemploymentTrend: 'Rising'
    },
    sectorPerformance: {
      Technology: 'Underperform',
      Healthcare: 'Outperform',
      'Consumer Staples': 'Outperform',
      'Consumer Discretionary': 'Underperform',
      'Communication Services': 'Underperform',
      Industrials: 'Market Perform',
      Energy: 'Outperform'
    },
    dividendSafety: 'Low for Growth, High for Value',
    description: 'Historic rate hikes to combat inflation. Treasury yields compete with dividends. Focus on dividend safety and payout coverage.'
  }
}

// Fiscal pressure scenarios (Treasury data seed)
const FISCAL_SCENARIOS = {
  Normal: {
    debtToGdp: 0.80,
    deficitToGdp: 0.03,
    interestExpenseRatio: 0.08,
    treasuryIssuance: 'Moderate',
    rateOutlook: 'Stable'
  },
  Elevated: {
    debtToGdp: 1.00,
    deficitToGdp: 0.05,
    interestExpenseRatio: 0.12,
    treasuryIssuance: 'High',
    rateOutlook: 'Higher for Longer'
  },
  Critical: {
    debtToGdp: 1.20,
    deficitToGdp: 0.08,
    interestExpenseRatio: 0.18,
    treasuryIssuance: 'Very High',
    rateOutlook: 'Uncertain'
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate synthetic monthly returns for a sector
 */
function generateSectorReturns(sector, avgMonthlyReturn, volatility) {
  const returns = {}
  const startDate = new Date(2010, 0, 1)
  const endDate = new Date(2024, 11, 31)

  // Sector-specific adjustments by regime
  const regimeAdjustments = {
    Technology: { LowRate: 1.3, RisingRate: 1.2, HighRate: 0.9, EasyMoney: 1.5, Tightening: 0.7 },
    Healthcare: { LowRate: 1.1, RisingRate: 1.0, HighRate: 1.2, EasyMoney: 1.3, Tightening: 1.1 },
    'Consumer Staples': { LowRate: 0.9, RisingRate: 0.8, HighRate: 1.1, EasyMoney: 1.0, Tightening: 1.2 },
    'Consumer Discretionary': { LowRate: 1.2, RisingRate: 1.1, HighRate: 0.9, EasyMoney: 1.3, Tightening: 0.8 },
    'Communication Services': { LowRate: 0.8, RisingRate: 1.0, HighRate: 1.0, EasyMoney: 1.2, Tightening: 0.7 },
    Industrials: { LowRate: 1.0, RisingRate: 1.1, HighRate: 0.9, EasyMoney: 0.8, Tightening: 1.0 },
    Energy: { LowRate: 0.6, RisingRate: 0.8, HighRate: 0.7, EasyMoney: 0.5, Tightening: 1.4 }
  }

  const adjustments = regimeAdjustments[sector] || { LowRate: 1, RisingRate: 1, HighRate: 1, EasyMoney: 1, Tightening: 1 }

  let currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const year = currentDate.getFullYear()
    const month = String(currentDate.getMonth() + 1).padStart(2, '0')
    const key = `${year}-${month}`

    // Determine regime for this date
    let regimeMultiplier = 1
    if (year >= 2010 && year < 2015) regimeMultiplier = adjustments.LowRate
    else if (year >= 2015 && year < 2018) regimeMultiplier = adjustments.RisingRate
    else if (year >= 2018 && year < 2020) regimeMultiplier = adjustments.HighRate
    else if (year >= 2020 && year < 2022) regimeMultiplier = adjustments.EasyMoney
    else if (year >= 2022) regimeMultiplier = adjustments.Tightening

    // Generate return with regime adjustment and randomness
    const randomFactor = (Math.random() - 0.5) * 2 * volatility
    returns[key] = avgMonthlyReturn * regimeMultiplier + randomFactor

    // Add market crashes
    if (key === '2020-03') returns[key] = -0.25 + Math.random() * 0.1 // COVID crash
    if (key === '2022-06') returns[key] = -0.08 + Math.random() * 0.04 // Rate shock

    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  return returns
}

/**
 * Calculate annualized return from cumulative return
 */
function annualizeReturn(cumulativeReturn, years) {
  if (years <= 0) return 0
  return (Math.pow(1 + cumulativeReturn, 1 / years) - 1) * 100
}

/**
 * Calculate standard deviation of returns
 */
function calculateStdDev(returns) {
  if (returns.length === 0) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const squaredDiffs = returns.map(r => Math.pow(r - mean, 2))
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / returns.length)
}

/**
 * Calculate maximum drawdown from a series of values
 */
function calculateMaxDrawdown(values) {
  let maxDrawdown = 0
  let peak = values[0]

  for (const value of values) {
    if (value > peak) {
      peak = value
    }
    const drawdown = (peak - value) / peak
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  return maxDrawdown * 100
}

// =============================================================================
// MAIN BACKTEST FUNCTIONS
// =============================================================================

/**
 * Calculate portfolio backtest with dividends reinvested
 * @param {Array<{ticker: string, weight: number}>} holdings - Portfolio holdings
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Object} Backtest results
 */
export function calculatePortfolioBacktest(holdings, startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const startYear = start.getFullYear()
  const startMonth = start.getMonth()
  const endYear = end.getFullYear()
  const endMonth = end.getMonth()

  // Normalize weights
  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0)
  const normalizedHoldings = holdings.map(h => ({
    ...h,
    weight: h.weight / totalWeight
  }))

  // Generate monthly data
  const monthlyData = []
  let portfolioValue = 10000
  const monthlyReturns = []
  let currentDate = new Date(startYear, startMonth, 1)

  while (currentDate <= end) {
    const year = currentDate.getFullYear()
    const month = String(currentDate.getMonth() + 1).padStart(2, '0')
    const key = `${year}-${month}`

    // Calculate weighted portfolio return for this month
    let portfolioMonthlyReturn = 0

    for (const holding of normalizedHoldings) {
      const tickerReturns = HISTORICAL_MONTHLY_RETURNS[holding.ticker]
      const monthlyReturn = tickerReturns?.[key] || 0

      // Add dividend yield (monthly portion)
      const annualDividend = HISTORICAL_DIVIDEND_YIELDS[holding.ticker] || 0.02
      const monthlyDividend = annualDividend / 12

      const totalReturn = monthlyReturn + monthlyDividend
      portfolioMonthlyReturn += totalReturn * holding.weight
    }

    monthlyReturns.push(portfolioMonthlyReturn)
    portfolioValue = portfolioValue * (1 + portfolioMonthlyReturn)

    monthlyData.push({
      date: key,
      value: Math.round(portfolioValue * 100) / 100,
      return: Math.round(portfolioMonthlyReturn * 10000) / 100
    })

    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  // Calculate metrics
  const totalReturn = ((portfolioValue - 10000) / 10000) * 100
  const years = monthlyData.length / 12
  const annualizedReturn = annualizeReturn((portfolioValue - 10000) / 10000, years)

  const volatility = calculateStdDev(monthlyReturns) * Math.sqrt(12) * 100 // Annualized
  const maxDrawdown = calculateMaxDrawdown(monthlyData.map(d => d.value))

  // Sharpe ratio (assuming 4% risk-free rate)
  const riskFreeRate = 4
  const sharpeRatio = volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0

  return {
    initialValue: 10000,
    finalValue: Math.round(portfolioValue * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    volatility: Math.round(volatility * 100) / 100,
    monthlyData,
    holdingCount: holdings.length,
    periodYears: Math.round(years * 10) / 10
  }
}

/**
 * Get macro regime for a given date
 * @param {Date|string} date - The date to check
 * @returns {Object} Macro regime information
 */
export function getMacroRegime(date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()

  let regimeKey = 'Tightening' // Default to current

  if (year >= 2010 && year < 2015) regimeKey = 'LowRate'
  else if (year >= 2015 && year < 2018) regimeKey = 'RisingRate'
  else if (year >= 2018 && year < 2020) regimeKey = 'HighRate'
  else if (year >= 2020 && year < 2022) regimeKey = 'EasyMoney'
  else if (year >= 2022) regimeKey = 'Tightening'

  const regime = MACRO_REGIMES[regimeKey]

  return {
    key: regimeKey,
    ...regime,
    date: d.toISOString().split('T')[0]
  }
}

/**
 * Get all macro regimes
 * @returns {Object} All regime definitions
 */
export function getAllMacroRegimes() {
  return MACRO_REGIMES
}

/**
 * Get historical backtest for a stock in a specific regime
 * @param {string} ticker - Stock ticker
 * @param {string} regimeKey - Regime key (LowRate, RisingRate, etc.)
 * @returns {Object} Historical performance in that regime
 */
export function getHistoricalBacktestForRegime(ticker, regimeKey) {
  const regime = MACRO_REGIMES[regimeKey]
  if (!regime) {
    return { error: 'Invalid regime' }
  }

  const tickerReturns = HISTORICAL_MONTHLY_RETURNS[ticker]
  if (!tickerReturns) {
    return { error: 'Unknown ticker' }
  }

  // Filter returns for this regime period
  const regimeReturns = []
  let wins = 0
  let losses = 0
  let totalWin = 0
  let totalLoss = 0

  for (const [dateKey, monthlyReturn] of Object.entries(tickerReturns)) {
    const year = parseInt(dateKey.split('-')[0])
    if (year >= regime.startYear && year < regime.endYear) {
      regimeReturns.push(monthlyReturn)
      if (monthlyReturn > 0) {
        wins++
        totalWin += monthlyReturn
      } else {
        losses++
        totalLoss += Math.abs(monthlyReturn)
      }
    }
  }

  if (regimeReturns.length === 0) {
    return { error: 'No data for this period' }
  }

  // Calculate cumulative return
  const cumulativeReturn = regimeReturns.reduce((acc, r) => acc * (1 + r), 1) - 1
  const years = regimeReturns.length / 12
  const annualizedReturn = annualizeReturn(cumulativeReturn, years)
  const volatility = calculateStdDev(regimeReturns) * Math.sqrt(12) * 100

  const winRate = (wins / (wins + losses)) * 100
  const avgWin = wins > 0 ? (totalWin / wins) * 100 : 0
  const avgLoss = losses > 0 ? (totalLoss / losses) * 100 : 0
  const avgWinLoss = avgLoss > 0 ? avgWin / avgLoss : avgWin

  // Get sector performance in this regime
  const sectorPerformance = regime.sectorPerformance

  return {
    ticker,
    regime: regime.name,
    period: regime.period,
    totalReturn: Math.round(cumulativeReturn * 10000) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    volatility: Math.round(volatility * 100) / 100,
    monthsAnalyzed: regimeReturns.length,
    wins,
    losses,
    winRate: Math.round(winRate * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    avgWinLoss: Math.round(avgWinLoss * 100) / 100,
    regimeCharacteristics: regime.characteristics,
    dividendSafety: regime.dividendSafety
  }
}

/**
 * Compare stock performance across all regimes
 * @param {string} ticker - Stock ticker
 * @returns {Array} Performance in each regime
 */
export function compareAcrossRegimes(ticker) {
  const results = []

  for (const regimeKey of Object.keys(MACRO_REGIMES)) {
    const performance = getHistoricalBacktestForRegime(ticker, regimeKey)
    if (!performance.error) {
      results.push(performance)
    }
  }

  return results
}

/**
 * Generate investment narrative based on portfolio, fundamentals, and macro conditions
 * @param {Array} portfolio - Portfolio holdings with fundamentals
 * @param {Object} fundamentals - Aggregated fundamentals
 * @param {Object} fiscalData - Treasury fiscal data
 * @param {Object} macroRegime - Current macro regime
 * @returns {Object} Generated narrative
 */
export function generateBacktestNarrative(portfolio, fundamentals, fiscalData, macroRegime) {
  // Determine fiscal pressure level
  let fiscalPressure = 'Normal'
  if (fiscalData?.debtToGdp > 1.1) fiscalPressure = 'Critical'
  else if (fiscalData?.debtToGdp > 0.9) fiscalPressure = 'Elevated'

  const fiscalScenario = FISCAL_SCENARIOS[fiscalPressure]

  // Calculate portfolio characteristics
  const avgYield = fundamentals?.avgYield || 2.5
  const avgGrowth = fundamentals?.avgGrowth || 6
  const avgPayoutRatio = fundamentals?.avgPayoutRatio || 45

  // Assess dividend safety
  let dividendSafety = 'Strong'
  if (avgPayoutRatio > 70) dividendSafety = 'Moderate'
  if (avgPayoutRatio > 85) dividendSafety = 'At Risk'

  // Build narrative components
  const fiscalCondition = {
    Normal: 'stable fiscal conditions with manageable debt levels',
    Elevated: 'elevated fiscal pressure with rising debt-to-GDP ratios',
    Critical: 'critical fiscal stress with unsustainable debt trajectories'
  }[fiscalPressure]

  const regimeName = macroRegime?.name || 'current market conditions'
  const rateOutlook = fiscalScenario.rateOutlook

  const yieldAssessment = avgYield >= 3
    ? `attractive ${avgYield.toFixed(2)}% portfolio yield that exceeds Treasury alternatives`
    : avgYield >= 2
      ? `competitive ${avgYield.toFixed(2)}% yield with growth potential`
      : `modest ${avgYield.toFixed(2)}% yield offset by strong dividend growth`

  const growthAssessment = avgGrowth >= 8
    ? `exceptional ${avgGrowth.toFixed(1)}% dividend growth that outpaces inflation`
    : avgGrowth >= 5
      ? `solid ${avgGrowth.toFixed(1)}% dividend growth providing real return protection`
      : `steady ${avgGrowth.toFixed(1)}% dividend growth focused on stability`

  const safetyAssessment = {
    Strong: 'Conservative payout ratios suggest dividends are well-covered by earnings with room for increases.',
    Moderate: 'Payout ratios are manageable but warrant monitoring if earnings compress.',
    'At Risk': 'Elevated payout ratios indicate potential dividend pressure in an economic downturn.'
  }[dividendSafety]

  // Rate expectation impact
  const rateImpact = {
    'Stable': 'Stable rate expectations support current dividend valuations.',
    'Higher for Longer': 'Higher-for-longer rates create yield competition but favor dividend growers over high yielders.',
    'Uncertain': 'Rate uncertainty favors quality dividend payers with strong balance sheets.'
  }[rateOutlook]

  // Generate thesis
  const thesis = `Given ${fiscalCondition} and ${regimeName}, this portfolio offers a ${yieldAssessment}. The ${growthAssessment}. ${safetyAssessment} ${rateImpact}`

  // Generate recommendations
  const recommendations = []

  if (avgPayoutRatio > 65) {
    recommendations.push('Consider reducing exposure to stocks with payout ratios above 70%')
  }
  if (avgYield < 2 && rateOutlook === 'Higher for Longer') {
    recommendations.push('Low yield may underperform in high-rate environment; consider adding income')
  }
  if (avgGrowth < 5) {
    recommendations.push('Below-average dividend growth may lag inflation; prioritize dividend growers')
  }
  if (fiscalPressure === 'Critical') {
    recommendations.push('Fiscal stress suggests favoring companies with domestic revenue and pricing power')
  }
  if (macroRegime?.characteristics?.marketVolatility === 'High') {
    recommendations.push('Elevated volatility favors defensive sectors like Consumer Staples and Healthcare')
  }

  // Risk factors
  const risks = []

  if (rateOutlook !== 'Stable') {
    risks.push(`${rateOutlook} rate trajectory may pressure dividend stock valuations`)
  }
  if (fiscalPressure !== 'Normal') {
    risks.push('Fiscal pressure could lead to higher corporate taxes affecting dividend capacity')
  }
  if (avgPayoutRatio > 60) {
    risks.push('Earnings recession could force dividend cuts in high-payout positions')
  }

  return {
    title: 'Portfolio Investment Thesis',
    fiscalPressure,
    macroRegime: regimeName,
    rateOutlook,
    thesis,
    portfolioMetrics: {
      avgYield: Math.round(avgYield * 100) / 100,
      avgGrowth: Math.round(avgGrowth * 100) / 100,
      avgPayoutRatio: Math.round(avgPayoutRatio),
      dividendSafety,
      holdingCount: portfolio?.length || 0
    },
    recommendations,
    risks,
    fiscalContext: {
      debtToGdp: fiscalScenario.debtToGdp,
      deficitToGdp: fiscalScenario.deficitToGdp,
      interestExpenseRatio: fiscalScenario.interestExpenseRatio,
      treasuryIssuance: fiscalScenario.treasuryIssuance
    },
    generatedAt: new Date().toISOString()
  }
}

/**
 * Get fiscal scenario data
 * @param {string} level - Fiscal pressure level (Normal, Elevated, Critical)
 * @returns {Object} Fiscal scenario data
 */
export function getFiscalScenario(level = 'Normal') {
  return FISCAL_SCENARIOS[level] || FISCAL_SCENARIOS.Normal
}

/**
 * Calculate optimal portfolio weights based on regime
 * @param {Array<string>} tickers - Available tickers
 * @param {string} regimeKey - Target regime
 * @returns {Array} Suggested portfolio weights
 */
export function suggestPortfolioForRegime(tickers, regimeKey) {
  const regime = MACRO_REGIMES[regimeKey]
  if (!regime) return []

  // Score each ticker based on regime performance
  const scored = tickers.map(ticker => {
    const performance = getHistoricalBacktestForRegime(ticker, regimeKey)
    if (performance.error) {
      return { ticker, score: 0 }
    }

    // Score based on return, volatility, and win rate
    const returnScore = performance.annualizedReturn / 10
    const volScore = (30 - performance.volatility) / 30
    const winScore = performance.winRate / 100

    return {
      ticker,
      score: returnScore * 0.5 + volScore * 0.3 + winScore * 0.2,
      metrics: performance
    }
  }).filter(s => s.score > 0)

  // Sort by score and assign weights
  scored.sort((a, b) => b.score - a.score)

  const totalScore = scored.reduce((sum, s) => sum + s.score, 0)
  return scored.map(s => ({
    ticker: s.ticker,
    weight: Math.round((s.score / totalScore) * 10000) / 100,
    expectedReturn: s.metrics.annualizedReturn,
    expectedVolatility: s.metrics.volatility
  }))
}

// Export all functions
export default {
  calculatePortfolioBacktest,
  getMacroRegime,
  getAllMacroRegimes,
  getHistoricalBacktestForRegime,
  compareAcrossRegimes,
  generateBacktestNarrative,
  getFiscalScenario,
  suggestPortfolioForRegime
}
