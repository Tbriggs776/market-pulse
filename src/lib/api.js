/**
 * Market Pulse — API surface
 *
 * All real API calls live in src/lib/services/*.js — one file per
 * data source. This file re-exports the public service surface so
 * pages import from a single place.
 */

export { newsService } from './services/news'

// Coming soon:
// export { marketsService } from './services/markets'
// export { stocksService } from './services/stocks'
// export { treasuryService } from './services/treasury'
// export { aiService } from './services/ai'