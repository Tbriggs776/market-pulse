/**
 * Market Pulse -- API surface
 *
 * All real API calls live in src/lib/services/*.js
 * This file re-exports the public service surface.
 */

export { newsService } from './services/news'
export { aiService } from './services/ai'
export { stocksService } from './services/stocks'

// Coming soon:
// export { treasuryService } from './services/treasury'