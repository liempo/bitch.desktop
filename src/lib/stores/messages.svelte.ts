import { getSessionMessages } from '$lib/api/dashboard'
import { getGateway } from '$lib/stores/gateway.svelte'
import {
  loadSessions,
  sessionState,
  setSessionNeedsInput,
  setSessionWorking,
  displaySessionIdFor
} from '$lib/stores/session.svelte'
import {
  clearAllPrompts,
  setApprovalRequest,
  setClarifyRequest,
  setSecretRequest,
  setSudoRequest
} from '$lib/stores/prompts.svelte'
import type { GatewayEvent } from '$lib/gateway/json-rpc-gateway'
import {
  compactWhitespace,
  coerceGatewayText,
  coerceThinkingBlocks,
  coerceThinkingText
} from '$lib/messages/chat-runtime'
import type { SessionMessage, UsageStats } from '$lib/types/hermes'

export type ThreadMessageRole = 'assistant' | 'system' | 'tool' | 'user'
export type ThreadToolStatus = 'complete' | 'running'

export interface ThreadTool {
  context?: string
  error?: string
  id: string
  input?: string
  name: string
  output?: string
  status: ThreadToolStatus
  summary: string
}

export interface ThreadMessage {
  error?: string
  id: string
  pending?: boolean
  /** Discrete reasoning/thinking blocks. Each block renders as its own
   *  collapsible disclosure so long reasoning stays scannable. */
  reasoning?: string[]
  role: ThreadMessageRole
  text: string
  timestamp?: number
  tools: ThreadTool[]
  usage?: Partial<UsageStats>
}

export interface ThreadSessionState {
  branch?: string
  busy: boolean
  cwd?: string
  currentAssistantId: string | null
  error: string | null
  hydrated: boolean
  loading: boolean
  messages: ThreadMessage[]
  model?: string
  needsInput: boolean
  provider?: string
  usage?: Partial<UsageStats>
}

interface MessageStoreState {
  sessions: Record<string, ThreadSessionState>
}

type GatewayPayload = Record<string, unknown>

const COMPLETION_ERROR_PATTERNS = [
  /^API call failed after \d+ retries:/i,
  /^HTTP\s+\d{3}\b/i,
  /^(Provider|Gateway)\s+error:/i
]

export const messageState = $state<MessageStoreState>({
  sessions: {}
})

let gatewayUnsubscribe: (() => void) | null = null
let nextMessageId = 0
let nextToolId = 0
const lastReasoningAt = new Map<string, number>()

function createThreadSession(): ThreadSessionState {
  return {
    busy: false,
    currentAssistantId: null,
    error: null,
    hydrated: false,
    loading: false,
    messages: [],
    needsInput: false
  }
}

function displaySessionId(sessionId: string): string {
  return displaySessionIdFor(sessionId)
}

function ensureThreadSession(sessionId: string): ThreadSessionState {
  messageState.sessions[sessionId] ??= createThreadSession()
  return messageState.sessions[sessionId]
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function payloadRecord(payload: unknown): GatewayPayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as GatewayPayload) : {}
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null

  const choices = value.filter((choice): choice is string => typeof choice === 'string')
  return choices.length > 0 ? choices : null
}

function payloadString(payload: GatewayPayload, key: string): string {
  const value = payload[key]
  return typeof value === 'string' ? value : ''
}

function recordInteractivePrompt(eventType: GatewayEvent['type'], sessionId: string, payload: GatewayPayload): void {
  if (eventType === 'clarify.request') {
    const requestId = payloadString(payload, 'request_id')
    const question = payloadString(payload, 'question')

    if (requestId && question) {
      setClarifyRequest({
        choices: stringList(payload.choices),
        question,
        requestId,
        sessionId
      })
    }
  } else if (eventType === 'approval.request') {
    setApprovalRequest({
      command: payloadString(payload, 'command'),
      description: payloadString(payload, 'description') || 'dangerous command',
      sessionId
    })
  } else if (eventType === 'sudo.request') {
    const requestId = payloadString(payload, 'request_id')

    if (requestId) {
      setSudoRequest({ requestId })
    }
  } else if (eventType === 'secret.request') {
    const requestId = payloadString(payload, 'request_id')

    if (requestId) {
      setSecretRequest({
        envVar: payloadString(payload, 'env_var'),
        prompt: payloadString(payload, 'prompt'),
        requestId
      })
    }
  }
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = coerceGatewayText(value)

    if (text.trim()) {
      return text
    }
  }

  return ''
}

function completionErrorText(finalText: string): string | null {
  const text = finalText.trim()

  return text && COMPLETION_ERROR_PATTERNS.some(pattern => pattern.test(text)) ? text : null
}

function setBusy(sessionId: string, busy: boolean): void {
  const thread = ensureThreadSession(sessionId)
  thread.busy = busy
  setSessionWorking(sessionId, busy)
}

function setNeedsInput(sessionId: string, needsInput: boolean): void {
  const thread = ensureThreadSession(sessionId)
  thread.needsInput = needsInput
  setSessionNeedsInput(sessionId, needsInput)
}

function newMessageId(prefix: string): string {
  nextMessageId += 1
  return `${prefix}-${Date.now()}-${nextMessageId}`
}

function newToolId(name: string): string {
  nextToolId += 1
  return `${name || 'tool'}-${Date.now()}-${nextToolId}`
}

function normalizeStoredMessage(sessionId: string, message: SessionMessage, index: number): ThreadMessage {
  const text = firstText(message.text, message.content)
  const reasoning =
    coerceThinkingBlocks(message.codex_reasoning_items).length > 0
      ? coerceThinkingBlocks(message.codex_reasoning_items)
      : coerceThinkingBlocks(message.reasoning_details).length > 0
        ? coerceThinkingBlocks(message.reasoning_details)
        : coerceThinkingBlocks(message.reasoning ?? message.reasoning_content)
  const role: ThreadMessageRole =
    message.role === 'assistant' || message.role === 'system' || message.role === 'tool' || message.role === 'user'
      ? message.role
      : 'assistant'

  if (role === 'tool') {
    const name = message.tool_name || message.name || 'tool'

    return {
      id: `stored-${sessionId}-${index}`,
      role,
      text: '',
      timestamp: message.timestamp,
      tools: [
        {
          context: firstText(message.context) || undefined,
          id: message.tool_call_id || `stored-tool-${sessionId}-${index}`,
          name,
          output: text,
          status: 'complete',
          summary: text || 'Tool completed'
        }
      ]
    }
  }

  return {
    id: `stored-${sessionId}-${index}`,
    reasoning,
    role,
    text,
    timestamp: message.timestamp,
    tools: []
  }
}

function replaceStoredMessages(sessionId: string, messages: SessionMessage[]): void {
  const threadId = displaySessionId(sessionId)
  const thread = ensureThreadSession(threadId)
  thread.messages = messages.map((message, index) => normalizeStoredMessage(threadId, message, index))
  thread.currentAssistantId = null
  thread.error = null
  thread.hydrated = true
  thread.loading = false
  thread.busy = false
  thread.needsInput = false
  setSessionWorking(threadId, false)
  setSessionNeedsInput(threadId, false)
}

function ensureAssistantMessage(sessionId: string): ThreadMessage {
  const thread = ensureThreadSession(sessionId)
  const current = thread.currentAssistantId
    ? thread.messages.find(message => message.id === thread.currentAssistantId && message.role === 'assistant')
    : null

  if (current) {
    return current
  }

  const message: ThreadMessage = {
    id: newMessageId('assistant-stream'),
    pending: true,
    reasoning: [],
    role: 'assistant',
    text: '',
    tools: []
  }

  thread.currentAssistantId = message.id
  thread.messages.push(message)

  return message
}

function beginAssistantMessage(sessionId: string): void {
  const thread = ensureThreadSession(sessionId)
  const existing = thread.currentAssistantId
    ? thread.messages.find(message => message.id === thread.currentAssistantId && message.pending)
    : null

  if (!existing) {
    const message: ThreadMessage = {
      id: newMessageId('assistant-stream'),
      pending: true,
      reasoning: [],
      role: 'assistant',
      text: '',
      tools: []
    }

    thread.currentAssistantId = message.id
    thread.messages.push(message)
  }

  thread.error = null
  setBusy(sessionId, true)
  setNeedsInput(sessionId, false)
}

function appendAssistantDelta(sessionId: string, delta: string): void {
  if (!delta) return

  const message = ensureAssistantMessage(sessionId)
  message.pending = true
  message.text += delta
  setBusy(sessionId, true)
}

const REASONING_GAP_MS = 1500

function appendReasoningDelta(sessionId: string, delta: string, replace = false): void {
  if (!delta) return

  const message = ensureAssistantMessage(sessionId)
  message.pending = true
  const blocks = message.reasoning ?? []
  const now = Date.now()
  const lastAt = lastReasoningAt.get(sessionId) ?? 0
  const gap = now - lastAt

  if (replace) {
    message.reasoning = [delta]
  } else if (blocks.length === 0 || gap > REASONING_GAP_MS) {
    blocks.push(delta)
    message.reasoning = blocks
  } else {
    blocks[blocks.length - 1] = `${blocks[blocks.length - 1]}${delta}`
    message.reasoning = blocks
  }

  lastReasoningAt.set(sessionId, now)
  setBusy(sessionId, true)
}

function toolName(payload: GatewayPayload): string {
  return firstText(payload.name, payload.tool_name, payload.tool) || 'tool'
}

function toolSummary(payload: GatewayPayload): string {
  return firstText(
    payload.summary,
    payload.message,
    payload.preview,
    payload.output,
    payload.result,
    payload.text,
    payload.error
  )
}

function toolContext(payload: GatewayPayload): string {
  return firstText(payload.context, payload.args_text, payload.command, payload.query, payload.url, payload.path)
}

function upsertTool(sessionId: string, payload: GatewayPayload, status: ThreadToolStatus): void {
  const message = ensureAssistantMessage(sessionId)
  const name = toolName(payload)
  const stableId = firstText(payload.tool_id, payload.tool_call_id, payload.id)

  // Try exact ID match first.
  let existing = stableId ? message.tools.find(tool => tool.id === stableId) : undefined

  // If the payload has a stable ID but no existing tool carries it, fall back
  // to matching a running tool by name. This handles live streams that start
  // without an id and later complete with one, preventing phantom duplicates.
  // Matches upstream hermes/desktop behaviour in findToolPartIndex.
  if (!existing) {
    const pendingSameName = message.tools.filter(tool => tool.status === 'running' && tool.name === name)

    if (pendingSameName.length > 0) {
      // Complete events resolve oldest-first (parallel tools). Running events
      // update the most-recent pending same-name tool.
      existing = status === 'complete' ? pendingSameName[0] : pendingSameName[pendingSameName.length - 1]
    }
  }

  const context = toolContext(payload)
  const summary = toolSummary(payload)
  const input = firstText(payload.args, payload.input)
  const output = firstText(payload.output, payload.result)
  const error = firstText(payload.error)

  if (existing) {
    existing.context = context || existing.context
    existing.error = error || existing.error
    existing.input = input || existing.input
    existing.name = name || existing.name
    existing.output = output || existing.output
    existing.status = status
    existing.summary = summary || existing.summary || (status === 'complete' ? 'Tool completed' : 'Running…')
  } else {
    const id = stableId || newToolId(name)

    message.tools.push({
      context: context || undefined,
      error: error || undefined,
      id,
      input: input || undefined,
      name,
      output: output || undefined,
      status,
      summary: summary || (status === 'complete' ? 'Tool completed' : 'Running…')
    })
  }

  message.pending = status === 'running' || message.pending
  setBusy(sessionId, true)
}

function completeAssistantMessage(sessionId: string, text: string, usage?: Partial<UsageStats>): void {
  const thread = ensureThreadSession(sessionId)
  const finalText = text.trim()
  const completionError = completionErrorText(finalText)
  const message =
    thread.currentAssistantId && thread.messages.some(item => item.id === thread.currentAssistantId)
      ? ensureAssistantMessage(sessionId)
      : finalText || completionError
        ? ensureAssistantMessage(sessionId)
        : null

  if (message) {
    if (completionError) {
      message.error = completionError
      message.text = ''
    } else if (finalText) {
      const previous = compactWhitespace(message.text)
      const next = compactWhitespace(finalText)

      if (!previous || previous !== next) {
        message.text = finalText
      }
    }

    message.pending = false
    message.usage = usage ?? message.usage
  }

  if (usage) {
    thread.usage = { ...(thread.usage ?? {}), ...usage }
  }

  thread.currentAssistantId = null
  thread.error = null
  setBusy(sessionId, false)
  setNeedsInput(sessionId, false)
  void loadSessions().catch(() => undefined)
}

function failAssistantMessage(sessionId: string, errorMessage: string): void {
  const thread = ensureThreadSession(sessionId)
  const message = ensureAssistantMessage(sessionId)

  message.error = errorMessage.trim() || 'Hermes reported an error'
  message.pending = false
  thread.currentAssistantId = null
  thread.error = message.error
  setBusy(sessionId, false)
  setNeedsInput(sessionId, false)
}

function usageFrom(payload: GatewayPayload): Partial<UsageStats> | undefined {
  return payload.usage && typeof payload.usage === 'object' && !Array.isArray(payload.usage)
    ? (payload.usage as Partial<UsageStats>)
    : undefined
}

function applyRuntimeInfo(sessionId: string, payload: GatewayPayload): void {
  const thread = ensureThreadSession(sessionId)

  if (typeof payload.model === 'string') {
    thread.model = payload.model
  }

  if (typeof payload.provider === 'string') {
    thread.provider = payload.provider
  }

  if (typeof payload.cwd === 'string') {
    thread.cwd = payload.cwd
  }

  if (typeof payload.branch === 'string') {
    thread.branch = payload.branch
  }

  const usage = usageFrom(payload)

  if (usage) {
    thread.usage = { ...(thread.usage ?? {}), ...usage }
  }

  if (typeof payload.running === 'boolean') {
    setBusy(sessionId, payload.running)
  }
}

function sessionIdForEvent(event: GatewayEvent): string | null {
  const sessionId = event.session_id || sessionState.activeSessionId
  return sessionId ? displaySessionId(sessionId) : null
}

export function threadForSession(sessionId: string | null | undefined): ThreadSessionState | null {
  return sessionId ? (messageState.sessions[displaySessionId(sessionId)] ?? null) : null
}

export function setThreadBusy(sessionId: string, busy: boolean): void {
  setBusy(displaySessionId(sessionId), busy)
}

export function appendUserMessage(sessionId: string, text: string, attachmentLabels: string[] = []): void {
  const threadId = displaySessionId(sessionId)
  const thread = ensureThreadSession(threadId)
  const attachments = attachmentLabels.map(label => `- ${label}`).join('\n')
  const attachmentBlock = attachments ? `\n\nAttached images:\n${attachments}` : ''

  thread.messages.push({
    id: newMessageId('user'),
    role: 'user',
    text: `${text}${attachmentBlock}`.trim(),
    timestamp: Date.now(),
    tools: []
  })
  thread.error = null
  thread.hydrated = true
}

export function appendSystemMessage(sessionId: string, text: string): void {
  const message = text.trim()
  if (!message) return

  const thread = ensureThreadSession(displaySessionId(sessionId))
  thread.messages.push({
    id: newMessageId('system'),
    role: 'system',
    text: message,
    timestamp: Date.now(),
    tools: []
  })
  thread.hydrated = true
}

export function appendAssistantErrorMessage(sessionId: string, text: string): void {
  const threadId = displaySessionId(sessionId)
  const message = ensureAssistantMessage(threadId)

  message.error = text.trim() || 'Hermes reported an error'
  message.pending = false
  message.text = message.text || ''
  ensureThreadSession(threadId).currentAssistantId = null
  setBusy(threadId, false)
  setNeedsInput(threadId, false)
}

export async function hydrateSessionMessages(sessionId: string, seed?: SessionMessage[]): Promise<void> {
  const threadId = displaySessionId(sessionId)
  const thread = ensureThreadSession(threadId)
  thread.loading = true
  thread.error = null

  try {
    const messages = seed ?? (await getSessionMessages(threadId)).messages
    replaceStoredMessages(threadId, messages)
  } catch (error) {
    thread.error = messageFor(error)
    thread.loading = false
    console.error('Failed to hydrate session messages:', error)
  }
}

export function hydrateSessionMessagesFromGateway(sessionId: string, messages: SessionMessage[] = []): void {
  replaceStoredMessages(sessionId, messages)
}

export function handleGatewayEvent(event: GatewayEvent): void {
  const payload = payloadRecord(event.payload)
  const sessionId = sessionIdForEvent(event)

  if (event.type === 'gateway.ready') {
    return
  }

  if (event.type === 'session.info' || event.type === 'status.update') {
    if (sessionId) {
      applyRuntimeInfo(sessionId, payload)
    }

    return
  }

  if (!sessionId) {
    return
  }

  if (event.type === 'message.start') {
    beginAssistantMessage(sessionId)
  } else if (event.type === 'message.delta') {
    appendAssistantDelta(sessionId, coerceGatewayText(payload.text))
    // A text delta after reasoning means the reasoning phase ended; the next
    // reasoning delta should start a fresh block so live blocks interleave
    // with tools the same way the server stores them on rehydration.
    lastReasoningAt.delete(sessionId)
  } else if (event.type === 'thinking.delta') {
    appendReasoningDelta(sessionId, coerceThinkingText(payload.text))
  } else if (event.type === 'reasoning.delta') {
    appendReasoningDelta(sessionId, coerceThinkingText(payload.text))
  } else if (event.type === 'reasoning.available') {
    appendReasoningDelta(sessionId, coerceThinkingText(payload.text), true)
  } else if (event.type === 'tool.start' || event.type === 'tool.progress' || event.type === 'tool.generating') {
    upsertTool(sessionId, payload, 'running')
    // Finalize the current reasoning block when a tool starts so reasoning
    // before and after the tool are rendered as separate blocks.
    lastReasoningAt.delete(sessionId)
  } else if (event.type === 'tool.complete') {
    upsertTool(sessionId, payload, 'complete')
    setNeedsInput(sessionId, false)
    // Also finalize reasoning on tool completion so the next reasoning delta
    // after the tool creates a new block.
    lastReasoningAt.delete(sessionId)
  } else if (event.type === 'message.complete') {
    completeAssistantMessage(sessionId, firstText(payload.text, payload.rendered), usageFrom(payload))
    clearAllPrompts()
    setNeedsInput(sessionId, false)
  } else if (
    event.type === 'clarify.request' ||
    event.type === 'approval.request' ||
    event.type === 'sudo.request' ||
    event.type === 'secret.request'
  ) {
    recordInteractivePrompt(event.type, sessionId, payload)
    setNeedsInput(sessionId, true)
  } else if (event.type === 'error') {
    clearAllPrompts()
    setNeedsInput(sessionId, false)
    failAssistantMessage(sessionId, firstText(payload.message, payload.error) || 'Hermes reported an error')
  }
}

export function startMessageStream(): void {
  if (gatewayUnsubscribe) return

  gatewayUnsubscribe = getGateway().onEvent(handleGatewayEvent)
}

export function stopMessageStream(): void {
  gatewayUnsubscribe?.()
  gatewayUnsubscribe = null
}
