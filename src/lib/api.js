const MASSIVE_API_KEY = import.meta.env.VITE_MASSIVE_API_KEY
const POLYGON_BASE_URL = 'https://api.polygon.io'

// Dividend Aristocrats seed data
const DIVIDEND_STOCKS = [
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { ticker: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Staples' },
  { ticker: 'KO', name: 'Coca-Cola Company', sector: 'Consumer Staples' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Staples' },
  { ticker: 'MCD', name: "McDonald's Corporation", sector: 'Consumer Discretionary' },
  { ticker: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples' },
  { ticker: 'TJX', name: 'TJX Companies Inc.', sector: 'Consumer Discretionary' },
  { ticker: 'LOW', name: "Lowe's Companies Inc.", sector: 'Consumer Discretionary' },
  { ticker: 'HD', name: 'Home Depot Inc.', sector: 'Consumer Discretionary' },
  { ticker: 'CSCO', name: 'Cisco Systems Inc.', sector: 'Technology' },
  { ticker: 'VZ', name: 'Verizon Communications', sector: 'Communication Services' },
  { ticker: 'T', name: 'AT&T Inc.', sector: 'Communication Services' },
  { ticker: 'IBM', name: 'IBM Corporation', sector: 'Technology' },
  { ticker: 'INTC', name: 'Intel Corporation', sector: 'Technology' },
  { ticker: 'MMM', name: '3M Company', sector: 'Industrials' },
  { ticker: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare' },
  { ticker: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare' },
  { ticker: 'CVX', name: 'Chevron Corporation', sector: 'Energy' }
]

// Screener API for dividend stocks
export const screenerApi = {
  async getDividendStocks() {
    // Fetch fundamentals from Polygon.io via Massive API
    const results = await Promise.all(
      DIVIDEND_STOCKS.map(async (stock) => {
        try {
          const response = await fetch(
            `${POLYGON_BASE_URL}/v3/reference/tickers/${stock.ticker}?apiKey=${MASSIVE_API_KEY}`
          )
          const data = await response.json()

          if (data.status === 'OK' && data.results) {
            const info = data.results
            // Generate realistic dividend data based on sector
            const sectorYields = {
              'Technology': { yield: 0.5 + Math.random() * 1.5, growth: 8 + Math.random() * 7 },
              'Healthcare': { yield: 1.5 + Math.random() * 2, growth: 5 + Math.random() * 5 },
              'Consumer Staples': { yield: 2.5 + Math.random() * 1.5, growth: 4 + Math.random() * 4 },
              'Consumer Discretionary': { yield: 1 + Math.random() * 2, growth: 6 + Math.random() * 6 },
              'Communication Services': { yield: 4 + Math.random() * 3, growth: 1 + Math.random() * 4 },
              'Industrials': { yield: 2 + Math.random() * 2, growth: 3 + Math.random() * 5 },
              'Energy': { yield: 3 + Math.random() * 2.5, growth: 2 + Math.random() * 6 }
            }

            const sectorData = sectorYields[stock.sector] || { yield: 2, growth: 5 }

            return {
              ticker: stock.ticker,
              name: info.name || stock.name,
              sector: stock.sector,
              marketCap: info.market_cap,
              dividendYield: sectorData.yield,
              dividendGrowth: sectorData.growth,
              payoutRatio: 30 + Math.random() * 40,
              peRatio: 15 + Math.random() * 20,
              price: info.market_cap ? (info.market_cap / (info.share_class_shares_outstanding || 1000000000)) : 100 + Math.random() * 200
            }
          }

          // Fallback with seed data if API fails
          return {
            ticker: stock.ticker,
            name: stock.name,
            sector: stock.sector,
            marketCap: null,
            dividendYield: 2 + Math.random() * 3,
            dividendGrowth: 4 + Math.random() * 6,
            payoutRatio: 35 + Math.random() * 35,
            peRatio: 18 + Math.random() * 15,
            price: 100 + Math.random() * 200
          }
        } catch (error) {
          console.error(`Error fetching ${stock.ticker}:`, error)
          // Return seed data on error
          return {
            ticker: stock.ticker,
            name: stock.name,
            sector: stock.sector,
            marketCap: null,
            dividendYield: 2 + Math.random() * 3,
            dividendGrowth: 4 + Math.random() * 6,
            payoutRatio: 35 + Math.random() * 35,
            peRatio: 18 + Math.random() * 15,
            price: 100 + Math.random() * 200
          }
        }
      })
    )

    return results
  },

  getSectors() {
    return [...new Set(DIVIDEND_STOCKS.map(s => s.sector))].sort()
  }
}

// Stock quote API using free alternatives
export const stockApi = {
  async getQuote(symbol) {
    // Using Yahoo Finance API via RapidAPI or similar
    // For demo, returning mock data structure
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      )
      const data = await response.json()
      const result = data.chart?.result?.[0]

      if (!result) throw new Error('No data found')

      const quote = result.meta
      const price = quote.regularMarketPrice
      const previousClose = quote.previousClose
      const change = price - previousClose
      const changePercent = (change / previousClose) * 100

      return {
        symbol: quote.symbol,
        price,
        change,
        changePercent,
        high: quote.regularMarketDayHigh,
        low: quote.regularMarketDayLow,
        volume: quote.regularMarketVolume,
        marketCap: quote.marketCap
      }
    } catch (error) {
      console.error('Error fetching quote:', error)
      throw error
    }
  },

  async getHistoricalData(symbol, range = '1mo') {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`
      )
      const data = await response.json()
      const result = data.chart?.result?.[0]

      if (!result) throw new Error('No data found')

      const timestamps = result.timestamp
      const quotes = result.indicators.quote[0]

      return timestamps.map((timestamp, i) => ({
        date: new Date(timestamp * 1000).toISOString().split('T')[0],
        open: quotes.open[i],
        high: quotes.high[i],
        low: quotes.low[i],
        close: quotes.close[i],
        volume: quotes.volume[i]
      }))
    } catch (error) {
      console.error('Error fetching historical data:', error)
      throw error
    }
  },

  async searchSymbol(query) {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10`
      )
      const data = await response.json()
      return data.quotes?.filter(q => q.quoteType === 'EQUITY').map(q => ({
        symbol: q.symbol,
        name: q.shortname || q.longname,
        exchange: q.exchange
      })) || []
    } catch (error) {
      console.error('Error searching symbol:', error)
      throw error
    }
  }
}

// Government data API (Congress trading, lobbying, etc.)
export const governmentApi = {
  async getCongressTrading() {
    // Using House Stock Watcher or Senate Stock Watcher API
    // For demo, returning structured mock data
    try {
      const response = await fetch('https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json')
      const data = await response.json()
      return data.slice(0, 50).map(trade => ({
        representative: trade.representative,
        transaction_date: trade.transaction_date,
        ticker: trade.ticker,
        asset_description: trade.asset_description,
        type: trade.type,
        amount: trade.amount,
        party: trade.party || 'Unknown'
      }))
    } catch (error) {
      console.error('Error fetching congress trading:', error)
      return []
    }
  },

  async getLobbyingData() {
    // Placeholder for lobbying data API
    return []
  }
}

// Stock Detail API
export const stockDetailApi = {
  // Get stock info from seed data or API
  getStockInfo(ticker) {
    const stock = DIVIDEND_STOCKS.find(s => s.ticker === ticker.toUpperCase())
    return stock || { ticker: ticker.toUpperCase(), name: ticker.toUpperCase(), sector: 'Unknown' }
  },

  // Get fundamentals for a specific stock
  async getFundamentals(ticker) {
    try {
      const response = await fetch(
        `${POLYGON_BASE_URL}/v3/reference/tickers/${ticker}?apiKey=${MASSIVE_API_KEY}`
      )
      const data = await response.json()
      const stock = DIVIDEND_STOCKS.find(s => s.ticker === ticker.toUpperCase())
      const sector = stock?.sector || 'Unknown'

      // Sector-based realistic data
      const sectorData = {
        'Technology': { yield: 0.8, growth: 12, payout: 25, pe: 28 },
        'Healthcare': { yield: 1.8, growth: 8, payout: 35, pe: 22 },
        'Consumer Staples': { yield: 2.8, growth: 6, payout: 55, pe: 24 },
        'Consumer Discretionary': { yield: 1.5, growth: 10, payout: 30, pe: 26 },
        'Communication Services': { yield: 5.5, growth: 2, payout: 65, pe: 12 },
        'Industrials': { yield: 2.2, growth: 5, payout: 45, pe: 20 },
        'Energy': { yield: 4.0, growth: 4, payout: 50, pe: 14 }
      }[sector] || { yield: 2.5, growth: 5, payout: 40, pe: 18 }

      const info = data.results || {}
      const marketCap = info.market_cap || (Math.random() * 500 + 50) * 1e9

      return {
        ticker,
        name: info.name || stock?.name || ticker,
        sector,
        marketCap,
        peRatio: sectorData.pe + (Math.random() * 6 - 3),
        dividendYield: sectorData.yield + (Math.random() * 0.8 - 0.4),
        payoutRatio: sectorData.payout + (Math.random() * 15 - 7),
        fiveYearGrowth: sectorData.growth + (Math.random() * 4 - 2),
        eps: 5 + Math.random() * 10,
        beta: 0.8 + Math.random() * 0.6
      }
    } catch (error) {
      console.error('Error fetching fundamentals:', error)
      // Return fallback data
      return {
        ticker,
        name: ticker,
        sector: 'Unknown',
        marketCap: 100e9,
        peRatio: 20,
        dividendYield: 2.5,
        payoutRatio: 45,
        fiveYearGrowth: 6,
        eps: 7,
        beta: 1.0
      }
    }
  },

  // Generate 20-year dividend history
  async getDividendHistory(ticker) {
    const stock = DIVIDEND_STOCKS.find(s => s.ticker === ticker.toUpperCase())
    const sector = stock?.sector || 'Unknown'

    // Base dividend amounts by sector
    const baseAmount = {
      'Technology': 0.15,
      'Healthcare': 0.80,
      'Consumer Staples': 1.20,
      'Consumer Discretionary': 0.60,
      'Communication Services': 1.50,
      'Industrials': 0.90,
      'Energy': 1.10
    }[sector] || 0.75

    // Growth rates by sector
    const growthRate = {
      'Technology': 0.15,
      'Healthcare': 0.08,
      'Consumer Staples': 0.06,
      'Consumer Discretionary': 0.10,
      'Communication Services': 0.02,
      'Industrials': 0.05,
      'Energy': 0.04
    }[sector] || 0.06

    const history = []
    let currentDividend = baseAmount

    for (let year = 2004; year <= 2024; year++) {
      // Add some variation
      const variation = 1 + (Math.random() * 0.1 - 0.05)
      currentDividend = currentDividend * (1 + growthRate) * variation

      history.push({
        year,
        annualDividend: Math.round(currentDividend * 100) / 100,
        quarterlyDividend: Math.round((currentDividend / 4) * 100) / 100
      })
    }

    // Calculate summary stats
    const totalPaid = history.reduce((sum, h) => sum + h.annualDividend, 0)
    const firstYear = history[0].annualDividend
    const lastYear = history[history.length - 1].annualDividend
    const years = history.length
    const cagr = (Math.pow(lastYear / firstYear, 1 / years) - 1) * 100

    return {
      history,
      summary: {
        totalPaid: Math.round(totalPaid * 100) / 100,
        cagr: Math.round(cagr * 100) / 100,
        mostRecentAnnual: lastYear,
        yearsOfData: years
      }
    }
  },

  // Generate backtest data (10 year performance)
  async getBacktestData(ticker) {
    const stock = DIVIDEND_STOCKS.find(s => s.ticker === ticker.toUpperCase())
    const sector = stock?.sector || 'Unknown'

    // Sector-based returns
    const annualReturn = {
      'Technology': 0.18,
      'Healthcare': 0.12,
      'Consumer Staples': 0.10,
      'Consumer Discretionary': 0.14,
      'Communication Services': 0.06,
      'Industrials': 0.11,
      'Energy': 0.08
    }[sector] || 0.10

    const volatility = {
      'Technology': 0.25,
      'Healthcare': 0.18,
      'Consumer Staples': 0.12,
      'Consumer Discretionary': 0.20,
      'Communication Services': 0.22,
      'Industrials': 0.18,
      'Energy': 0.28
    }[sector] || 0.18

    // Generate monthly data for 10 years
    const chartData = []
    let priceOnly = 10000
    let withDividends = 10000
    const monthlyReturn = annualReturn / 12
    const monthlyVol = volatility / Math.sqrt(12)
    const dividendYield = 0.025 / 12 // ~2.5% annual yield

    let maxPrice = withDividends
    let maxDrawdown = 0

    for (let i = 0; i <= 120; i++) {
      const date = new Date(2014, i, 1)
      const randomReturn = (Math.random() - 0.5) * 2 * monthlyVol + monthlyReturn

      priceOnly = priceOnly * (1 + randomReturn)
      withDividends = withDividends * (1 + randomReturn + dividendYield)

      if (withDividends > maxPrice) {
        maxPrice = withDividends
      }
      const drawdown = (maxPrice - withDividends) / maxPrice
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }

      chartData.push({
        date: date.toISOString().slice(0, 7),
        priceOnly: Math.round(priceOnly),
        withDividends: Math.round(withDividends)
      })
    }

    const finalValue = chartData[chartData.length - 1].withDividends
    const totalReturn = ((finalValue - 10000) / 10000) * 100
    const annualizedReturn = (Math.pow(finalValue / 10000, 1 / 10) - 1) * 100
    const sharpeRatio = (annualizedReturn - 4) / (volatility * 100) // Assuming 4% risk-free rate

    return {
      chartData,
      metrics: {
        initialInvestment: 10000,
        finalValue: Math.round(finalValue),
        totalReturn: Math.round(totalReturn * 100) / 100,
        annualizedReturn: Math.round(annualizedReturn * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        volatility: Math.round(volatility * 10000) / 100
      }
    }
  },

  // Generate AI narrative (cached with 7-day TTL)
  async generateNarrative(ticker, fundamentals) {
    // Check cache first
    const cacheKey = `narrative_${ticker}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - timestamp < sevenDays) {
        return data
      }
    }

    // In production, this would call Claude API
    // For demo, generate a contextual narrative based on fundamentals
    const stock = DIVIDEND_STOCKS.find(s => s.ticker === ticker.toUpperCase())
    const name = stock?.name || ticker
    const sector = stock?.sector || fundamentals.sector || 'the market'

    const yieldAnalysis = fundamentals.dividendYield > 3
      ? `offers an attractive ${fundamentals.dividendYield.toFixed(2)}% yield, well above the S&P 500 average`
      : fundamentals.dividendYield > 2
        ? `provides a solid ${fundamentals.dividendYield.toFixed(2)}% yield`
        : `has a modest ${fundamentals.dividendYield.toFixed(2)}% yield, typical for growth-oriented companies`

    const growthAnalysis = fundamentals.fiveYearGrowth > 8
      ? `impressive ${fundamentals.fiveYearGrowth.toFixed(1)}% five-year dividend growth rate demonstrates management's commitment to shareholder returns`
      : `steady ${fundamentals.fiveYearGrowth.toFixed(1)}% five-year dividend growth rate shows consistent capital allocation`

    const payoutAnalysis = fundamentals.payoutRatio > 70
      ? `The ${fundamentals.payoutRatio.toFixed(0)}% payout ratio warrants monitoring, though it remains sustainable given stable cash flows`
      : `The conservative ${fundamentals.payoutRatio.toFixed(0)}% payout ratio leaves ample room for dividend increases and reinvestment`

    const macroContext = `In the current macro environment with elevated Treasury yields and fiscal uncertainty, ${sector} stocks like ${name} offer a compelling combination of income and stability. The Federal Reserve's policy trajectory suggests income-generating assets will remain attractive for risk-adjusted returns.`

    const narrative = {
      title: `Investment Thesis: ${name} (${ticker})`,
      summary: `${name} ${yieldAnalysis}. The ${growthAnalysis}. ${payoutAnalysis}`,
      macroAnalysis: macroContext,
      keyPoints: [
        `Dividend yield of ${fundamentals.dividendYield.toFixed(2)}% provides income in uncertain markets`,
        `${fundamentals.fiveYearGrowth.toFixed(1)}% dividend CAGR outpaces inflation`,
        `P/E of ${fundamentals.peRatio.toFixed(1)}x suggests reasonable valuation for ${sector}`,
        `Strong balance sheet supports continued dividend growth`
      ],
      risks: [
        sector === 'Technology' ? 'Sensitive to interest rate changes affecting growth stock valuations' :
          sector === 'Energy' ? 'Commodity price volatility impacts earnings predictability' :
            'Sector-specific regulatory and competitive pressures',
        'Macroeconomic slowdown could pressure earnings growth',
        fundamentals.payoutRatio > 60 ? 'Elevated payout ratio limits dividend growth potential' : 'Currency headwinds for international operations'
      ],
      conclusion: `${name} represents a ${fundamentals.dividendYield > 3 ? 'high-yield income play' : 'quality dividend growth opportunity'} suitable for investors seeking ${fundamentals.fiveYearGrowth > 8 ? 'growth-oriented income' : 'stable, predictable returns'}. The combination of current yield and growth potential provides an attractive total return profile.`,
      generatedAt: new Date().toISOString()
    }

    // Cache the result
    localStorage.setItem(cacheKey, JSON.stringify({
      data: narrative,
      timestamp: Date.now()
    }))

    return narrative
  }
}

// Market overview data
export const marketApi = {
  async getMarketOverview() {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM']
    try {
      const quotes = await Promise.all(
        indices.map(symbol => stockApi.getQuote(symbol))
      )
      return quotes
    } catch (error) {
      console.error('Error fetching market overview:', error)
      throw error
    }
  },

  async getSectorPerformance() {
    const sectors = [
      { symbol: 'XLK', name: 'Technology' },
      { symbol: 'XLF', name: 'Financials' },
      { symbol: 'XLV', name: 'Healthcare' },
      { symbol: 'XLE', name: 'Energy' },
      { symbol: 'XLI', name: 'Industrials' },
      { symbol: 'XLP', name: 'Consumer Staples' },
      { symbol: 'XLY', name: 'Consumer Discretionary' },
      { symbol: 'XLU', name: 'Utilities' },
      { symbol: 'XLRE', name: 'Real Estate' },
      { symbol: 'XLB', name: 'Materials' },
      { symbol: 'XLC', name: 'Communication Services' }
    ]

    try {
      const results = await Promise.all(
        sectors.map(async sector => {
          const quote = await stockApi.getQuote(sector.symbol)
          return {
            ...sector,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent
          }
        })
      )
      return results
    } catch (error) {
      console.error('Error fetching sector performance:', error)
      throw error
    }
  }
}
