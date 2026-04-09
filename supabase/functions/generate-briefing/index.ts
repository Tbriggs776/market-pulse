// ────────────────────────────────────────────────────────────
// Supabase Edge Function: generate-briefing
// ────────────────────────────────────────────────────────────
// Runtime: Deno (NOT Node). Uses URL-based imports.
//
// Job: Receive a POST with today's news headlines, call Claude
// Haiku 4.5 to generate a 3-4 paragraph morning briefing for
// an institutional investor, return the text.
//
// Secrets required (set via `supabase secrets set`):
//   ANTHROPIC_API_KEY  — your Claude API key
//
// Public API:
//   POST /functions/v1/generate-briefing
//   Headers:
//     Authorization: Bearer <SUPABASE_ANON_KEY>
//     Content-Type: application/json
//   Body:
//     {
//       articles: Array<{ title, description, source, category }>,
//       state?: string  (default "Arizona")
//     }
//   Response 200:
//     { briefing: string, generatedAt: string, model: string }
//   Response 4xx/5xx:
//     { error: string }
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

// The model we're using. Locked to a specific version so behavior
// doesn't drift between deploys. If we want to change models, this
// is a deliberate code change, not a silent upgrade.
const MODEL = 'claude-haiku-4-5-20251001'

// CORS headers — required because the frontend calls this function
// directly from the browser. Supabase's default Edge Function deploy
// does NOT add CORS for you; you have to do it yourself.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ────────────────────────────────────────────────────────────
// Prompt construction
// ────────────────────────────────────────────────────────────

/**
 * Build the user prompt that gets sent to Claude. The system prompt
 * establishes the persona; this function fills in today's news.
 *
 * Keep the format tight — Haiku does better with well-structured
 * input than with free-form text dumps.
 */
function buildUserPrompt(
  articles: Array<{
    title: string
    description: string | null
    source: string
    category: string
  }>,
  state: string,
): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Group articles by category so Claude can reason about local vs
  // national vs business separately.
  const byCategory: Record<string, typeof articles> = {
    business: [],
    national: [],
    local: [],
  }
  for (const a of articles) {
    if (byCategory[a.category]) {
      byCategory[a.category].push(a)
    }
  }

  const formatArticles = (arr: typeof articles) =>
    arr
      .slice(0, 8) // cap per category — Haiku doesn't need all 30
      .map(
        (a, i) =>
          `${i + 1}. [${a.source}] ${a.title}${
            a.description ? `\n   ${a.description}` : ''
          }`,
      )
      .join('\n')

  return `Today is ${today}. The user is based in ${state} and is an institutional investor and fractional CFO.

Below are today's top stories. Write a morning briefing of exactly 3-4 paragraphs (no more) that:

1. Opens with the most significant market or business development and its implications
2. Covers 2-3 other notable stories that an investor should know, with cause-and-effect reasoning (not just restating headlines)
3. Includes any relevant ${state}-specific angle if the local news warrants it — otherwise skip it, don't force it
4. Closes with a forward-looking sentence: what to watch for in the next 24 hours

Tone: institutional, measured, specific. Name companies, numbers, and dollar amounts when available. No bullet points, no headings, no emoji, no disclaimers ("this is not financial advice" etc — the UI handles those). Do not mention that you are an AI. Write as if you are a research analyst briefing a senior partner over coffee.

BUSINESS & MARKETS (${byCategory.business.length} stories):
${formatArticles(byCategory.business) || '(none today)'}

NATIONAL (${byCategory.national.length} stories):
${formatArticles(byCategory.national) || '(none today)'}

LOCAL — ${state} (${byCategory.local.length} stories):
${formatArticles(byCategory.local) || '(none today)'}

Begin the briefing now. Do not preamble.`
}

const SYSTEM_PROMPT =
  'You are a senior research analyst at an institutional investment firm. You write concise, specific morning briefings for a CFO and portfolio manager. You have no ideological lean. You care about signal, not noise.'

// ────────────────────────────────────────────────────────────
// Anthropic API call
// ────────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  articles: Array<{
    title: string
    description: string | null
    source: string
    category: string
  }>,
  state: string,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800, // ~4 paragraphs is well under this
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(articles, state),
        },
      ],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(
      `Anthropic API returned ${response.status}: ${errBody.slice(0, 200)}`,
    )
  }

  const data = await response.json()

  // Anthropic's response shape:
  //   { content: [{ type: 'text', text: '...' }, ...], ... }
  // We concatenate all text blocks in case there are multiple.
  const textBlocks = (data.content || []).filter(
    (block: { type: string }) => block.type === 'text',
  )
  if (textBlocks.length === 0) {
    throw new Error('Anthropic response contained no text blocks')
  }
  return textBlocks.map((b: { text: string }) => b.text).join('\n\n').trim()
}

// ────────────────────────────────────────────────────────────
// HTTP handler
// ────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Env
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  // Parse body
  let body: {
    articles?: Array<{
      title: string
      description: string | null
      source: string
      category: string
    }>
    state?: string
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const articles = body.articles || []
  const state = body.state || 'Arizona'

  if (!Array.isArray(articles) || articles.length === 0) {
    return new Response(
      JSON.stringify({ error: 'articles array is required and non-empty' }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  // Call Claude
  try {
    const briefing = await callClaude(apiKey, articles, state)
    return new Response(
      JSON.stringify({
        briefing,
        generatedAt: new Date().toISOString(),
        model: MODEL,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[generate-briefing] Claude call failed:', err)
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error generating briefing',
      }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }
})