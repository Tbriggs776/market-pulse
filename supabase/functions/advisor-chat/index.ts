import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const MODEL_IDS: Record<string, string> = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-5",
  haiku: "claude-haiku-4-5",
}

const SYSTEM_PROMPT_BASE = `You are the Market Pulse Advisor, a portfolio-aware financial research assistant built for a fractional CFO and investor. You operate with two modes and pick the right one based on the question:

PORTFOLIO CFO MODE (default when user asks about their positions, allocation, sizing, exposure, or "should I"): concise, data-forward, institutional tone. Cite specific tickers from the user's watchlist by name. Reference current macro data when relevant. Give concrete recommendations with reasoning, not hedged advice. You can be direct about concerns.

RESEARCH COPILOT MODE (when user is exploring a thesis, asking "what do you think about X," or working through an analysis): Socratic, exploratory, suggest angles they haven't considered, play devil's advocate on their thesis, surface counterfactuals and second-order effects.

Always:
- Be specific. Name tickers, cite numbers, reference dates.
- Be honest about uncertainty. When you don't know, say so.
- Prefer decisions over commentary. If asked "should I," give a view.
- Keep responses focused. A tight two-paragraph answer beats a sprawling five.
- Do not remind the user you are an AI. Do not add disclaimers about not being a licensed advisor unless the user asks about regulated advice.

The user is a fractional CFO who runs a PE acquisition platform (Veritas Ridge) and a financial advisory practice (Growth by the Numbers). They think institutionally. Match that register.`

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "n/a"
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toFixed(2)}`
}

async function buildPortfolioSnapshot(supabaseAdmin: any, userId: string): Promise<string> {
  const parts: string[] = []
  const today = new Date().toISOString().slice(0, 10)
  parts.push(`TODAY: ${today}`)

  try {
    const { data: watchlist } = await supabaseAdmin
      .from("watchlist")
      .select("symbol, name, exchange, added_price, alert_price, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30)

    if (watchlist && watchlist.length > 0) {
      parts.push("")
      parts.push(`USER WATCHLIST (${watchlist.length} tickers):`)
      for (const w of watchlist) {
        const addedAt = w.added_price ? ` added at ${formatCurrency(w.added_price)}` : ""
        const alert = w.alert_price ? ` alert @ ${formatCurrency(w.alert_price)}` : ""
        parts.push(`- ${w.symbol}${w.name ? ` (${w.name})` : ""}${addedAt}${alert}`)
      }
    } else {
      parts.push("")
      parts.push("USER WATCHLIST: empty")
    }
  } catch (_) {
    parts.push("USER WATCHLIST: unavailable")
  }

  try {
    const { data: bench } = await supabaseAdmin
      .from("research_bench")
      .select("symbol, name, sector, status, notes, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20)

    if (bench && bench.length > 0) {
      parts.push("")
      parts.push(`RESEARCH BENCH (${bench.length} items):`)
      for (const b of bench) {
        const note = b.notes ? ` -- ${b.notes.slice(0, 120)}` : ""
        parts.push(`- ${b.symbol} [${b.status}]${b.sector ? ` (${b.sector})` : ""}${note}`)
      }
    }
  } catch (_) { /* silent */ }

  return parts.join("\n")
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "")
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }
    const userId = userData.user.id

    const body = await req.json()
    const { conversationId: incomingConvId, userMessage, modelKey = "sonnet" } = body as {
      conversationId?: string
      userMessage: string
      modelKey?: "sonnet" | "opus" | "haiku"
    }

    if (!userMessage || !userMessage.trim()) {
      return new Response(JSON.stringify({ error: "Empty message" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const modelId = MODEL_IDS[modelKey] || MODEL_IDS.sonnet

    // Ensure conversation exists
    let conversationId = incomingConvId
    if (!conversationId) {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from("advisor_conversations")
        .insert({ user_id: userId, title: userMessage.slice(0, 60), model: modelKey })
        .select()
        .single()
      if (convErr) throw convErr
      conversationId = newConv.id
    }

    // Persist the user message
    await supabaseAdmin.from("advisor_messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: userMessage,
    })

    // Load prior message history for this conversation
    const { data: history } = await supabaseAdmin
      .from("advisor_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40)

    const claudeMessages = (history || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: m.content }))

    // Build the portfolio snapshot (server-side, always fresh)
    const snapshot = await buildPortfolioSnapshot(supabaseAdmin, userId)
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n=== PORTFOLIO CONTEXT ===\n${snapshot}\n=== END CONTEXT ===`

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not set")

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2048,
        system: systemPrompt,
        messages: claudeMessages,
        stream: true,
      }),
    })

    if (!claudeRes.ok || !claudeRes.body) {
      const errText = await claudeRes.text()
      return new Response(JSON.stringify({ error: `Claude API error: ${errText}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Stream response to client as SSE; collect assistant text to persist when done
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        // Send conversation id first so client can update URL
        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ conversationId })}\n\n`))

        let assistantText = ""
        let inputTokens = 0
        let outputTokens = 0
        const reader = claudeRes.body!.getReader()
        let buffer = ""

        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              const payload = line.slice(6).trim()
              if (!payload || payload === "[DONE]") continue
              try {
                const evt = JSON.parse(payload)
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const chunk = evt.delta.text as string
                  assistantText += chunk
                  controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`))
                } else if (evt.type === "message_start" && evt.message?.usage) {
                  inputTokens = evt.message.usage.input_tokens || 0
                } else if (evt.type === "message_delta" && evt.usage) {
                  outputTokens = evt.usage.output_tokens || outputTokens
                }
              } catch (_) { /* ignore parse errors */ }
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`))
        }

        // Persist assistant message
        if (assistantText) {
          await supabaseAdmin.from("advisor_messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "assistant",
            content: assistantText,
            model: modelKey,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          })
        }

        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (e) {
    const msg = String((e as Error).message || e)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})