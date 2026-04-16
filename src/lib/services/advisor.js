/**
 * Advisor Service -- streaming chat + conversation management
 */
import { supabase } from '../supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

async function listConversations(limit = 50) {
  const { data, error } = await supabase
    .from('advisor_conversations')
    .select('id, title, summary, model, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

async function getConversation(conversationId) {
  const { data: conv, error: convErr } = await supabase
    .from('advisor_conversations')
    .select('id, title, model, created_at, updated_at')
    .eq('id', conversationId)
    .maybeSingle()
  if (convErr) throw convErr

  const { data: messages, error: msgErr } = await supabase
    .from('advisor_messages')
    .select('id, role, content, model, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (msgErr) throw msgErr

  return { conversation: conv, messages: messages || [] }
}

async function deleteConversation(conversationId) {
  const { error } = await supabase
    .from('advisor_conversations')
    .delete()
    .eq('id', conversationId)
  if (error) throw error
}

async function renameConversation(conversationId, title) {
  const { error } = await supabase
    .from('advisor_conversations')
    .update({ title })
    .eq('id', conversationId)
  if (error) throw error
}

/**
 * Send a message and stream the assistant reply.
 * onDelta(text) called for each streamed chunk.
 * onMeta({ conversationId }) called once with conv id (matters when starting new conv).
 * Returns Promise resolving to final { conversationId, assistantText } when stream completes.
 */
async function sendMessage({ conversationId, userMessage, modelKey = 'sonnet', onDelta, onMeta }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/advisor-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ conversationId, userMessage, modelKey }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Advisor chat failed: ${errText}`)
  }
  if (!resp.body) throw new Error('No response stream')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalConversationId = conversationId
  let assistantText = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const raw of events) {
      if (!raw.trim()) continue
      let eventName = 'message'
      let dataLine = ''
      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataLine = line.slice(6)
      }
      if (!dataLine) continue
      try {
        const payload = JSON.parse(dataLine)
        if (eventName === 'meta') {
          finalConversationId = payload.conversationId || finalConversationId
          if (onMeta) onMeta({ conversationId: finalConversationId })
        } else if (eventName === 'delta') {
          assistantText += payload.text || ''
          if (onDelta) onDelta(payload.text || '')
        } else if (eventName === 'error') {
          throw new Error(payload.error || 'Stream error')
        } else if (eventName === 'done') {
          // noop
        }
      } catch (e) {
        // ignore parse errors on partial lines
      }
    }
  }

  return { conversationId: finalConversationId, assistantText }
}

export const advisorService = {
  listConversations,
  getConversation,
  deleteConversation,
  renameConversation,
  sendMessage,
}