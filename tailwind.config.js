/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ============================================================
        // Veritas Ridge × Institutional Patriotic Palette
        // ============================================================
        // Usage rules (enforce in code review):
        //   - canvas/surface/surface-elevated: page + card backgrounds
        //   - gold: brand marks, primary CTAs, active nav, highlights
        //   - crimson: downside, alerts, sell signals (sparingly)
        //   - patriot: federal/Treasury context only
        //   - positive: gains, ups, buy signals
        //   - ivory/text-*: all text
        //   - border: all dividers and outlines
        // ============================================================

        // Canvas system (dark mode native)
        canvas: '#0A0A0B',           // true near-black, matches logos
        surface: '#15151A',          // cards, nav
        'surface-elevated': '#1F1F26', // modals, hover states
        border: '#2A2A33',           // dividers, outlines

        // Brand gold — the Veritas Ridge identity color
        gold: {
          DEFAULT: '#C9A961',        // primary brand gold
          bright: '#E5C97A',         // hover, focus, emphasis
          dim: '#9B8349',            // pressed states, dim accents
        },

        // Text
        ivory: '#F5F1E8',            // primary text (warm, not white)
        'text-secondary': '#9CA0A8', // labels, timestamps, captions
        'text-muted': '#5A5E66',     // disabled, hints

        // Semantic: downside
        crimson: {
          DEFAULT: '#B22234',        // flag red, downside numbers
          dim: '#7A1822',            // error backgrounds
        },

        // Semantic: upside
        positive: {
          DEFAULT: '#5FA572',        // muted institutional green
          dim: '#3D7A4F',            // deeper, for light mode
        },

        // Patriot blue — federal/Treasury accent ONLY
        patriot: {
          DEFAULT: '#1B3A6B',        // flag navy
          bright: '#2C5490',         // highlight within Government page
        },
      },

      fontFamily: {
        // Brand serif — used for the "Market Pulse" wordmark and page h1s
        serif: ['Cinzel', 'Trajan Pro', 'Palatino', 'serif'],
        // Body serif — for section headings, long-form prose in briefings
        'serif-body': ['"Source Serif 4"', 'Georgia', 'serif'],
        // Sans — primary UI font
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // Monospace — for all tabular figures (prices, percentages, yields)
        mono: ['"IBM Plex Mono"', 'Menlo', 'Monaco', 'monospace'],
      },

      fontSize: {
        // Slightly tighter scale than Tailwind default for denser info display
        'tabular': ['0.9375rem', { lineHeight: '1.4', fontFeatureSettings: '"tnum"' }],
      },

      boxShadow: {
        // Subtle elevation, never harsh
        'card': '0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 1px 3px 0 rgba(0, 0, 0, 0.3)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.4)',
        // Gold focus ring — used on inputs, focused buttons
        'gold-focus': '0 0 0 2px rgba(201, 169, 97, 0.4)',
      },

      // A grain-film texture overlay variable, applied in index.css as ::before.
      // Adds subtle paper/print texture to surfaces — institutional feel.
    },
  },
  plugins: [],
}