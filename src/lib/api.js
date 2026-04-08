const MASSIVE_API_KEY = import.meta.env.VITE_MASSIVE_API_KEY
const MASSIVE_BASE_URL = 'https://api.massive.io/v1'

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
