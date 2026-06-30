import {
  buildAssistantCompleteNotification,
  buildInputNeededNotification,
  sendMacosNotification
} from '$lib/platform/notifications'
import { configureGatewayRegistry } from '$lib/hermes/gateway'
import { extractCanvasReferences, type ConversationCanvas } from '../domain/canvas'
import {
  loadSessions,
  noteSessionActivity,
  sessionState,
  setSessionNeedsInput,
  setSessionWorking,
  displaySessionIdFor
} from '$lib/hermes/sessions'
import {
  clearAllPrompts,
  setApprovalRequest,
  setClarifyRequest,
  setSecretRequest,
  setSudoRequest
} from '$lib/hermes/prompts'
import type { GatewayEvent } from '$lib/hermes/gateway'
import {
  coerceGatewayText,
  coerceThinkingBlocks,
  coerceThinkingText,
  extractEmbeddedImages
} from '../domain/message-normalization'
import {
  attachmentDisplayLabel,
  attachmentFromMediaSource,
  cloneConversationAttachment,
  extractImageDirectiveSources,
  extractMediaDirectiveSources,
  imageSourcesFromContent,
  type ConversationAttachment,
  type ConversationAttachmentInput
} from '../domain/media-attachments'
import type { SessionMessage, UsageStats } from '$lib/types/hermes'

type ConversationMessageRole = 'assistant' | 'system' | 'tool' | 'user'
export type ConversationToolStatus = 'complete' | 'running'

export interface ConversationTool {
  context?: string
  error?: string
  id: string
  input?: string
  name: string
  output?: string
  status: ConversationToolStatus
  summary: string
}

type ConversationMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ConversationTool }

export interface ConversationMessage {
  attachments?: ConversationAttachment[]
  canvas?: ConversationCanvas
  error?: string
  id: string
  /** Chronological render order for assistant content. When present, the UI
   *  renders from this array instead of the legacy reasoning/tools/text buckets. */
  parts?: ConversationMessagePart[]
  pending?: boolean
  /** Discrete reasoning/thinking blocks. Each block renders as its own
   *  collapsible disclosure so long reasoning stays scannable. */
  reasoning?: string[]
  role: ConversationMessageRole
  text: string
  timestamp?: number
  tools: ConversationTool[]
  usage?: Partial<UsageStats>
}

export interface ConversationSessionState {
  branch?: string
  busy: boolean
  canvas?: ConversationCanvas
  cwd?: string
  currentAssistantId: string | null
  error: string | null
  fast?: boolean
  hydrated: boolean
  loading: boolean
  messages: ConversationMessage[]
  model?: string
  needsInput: boolean
  provider?: string
  reasoningEffort?: string
  usage?: Partial<UsageStats>
}

interface MessageStoreState {
  sessions: Record<string, ConversationSessionState>
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

let gatewayStreamStarted = false
let nextMessageId = 0
let nextToolId = 0
const lastReasoningAt = new Map<string, number>()

function createConversationSession(): ConversationSessionState {
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

function ensureConversationSession(sessionId: string): ConversationSessionState {
  messageState.sessions[sessionId] ??= createConversationSession()
  return messageState.sessions[sessionId]
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
  const profile = payloadString(payload, 'profile') || null

  if (eventType === 'clarify.request') {
    const requestId = payloadString(payload, 'request_id')
    const question = payloadString(payload, 'question')

    if (requestId && question) {
      setClarifyRequest({
        choices: stringList(payload.choices),
        profile,
        question,
        requestId,
        sessionId
      })
    }
  } else if (eventType === 'approval.request') {
    setApprovalRequest({
      command: payloadString(payload, 'command'),
      description: payloadString(payload, 'description') || 'dangerous command',
      profile,
      sessionId
    })
  } else if (eventType === 'sudo.request') {
    const requestId = payloadString(payload, 'request_id')

    if (requestId) {
      setSudoRequest({ profile, requestId, sessionId })
    }
  } else if (eventType === 'secret.request') {
    const requestId = payloadString(payload, 'request_id')

    if (requestId) {
      setSecretRequest({
        envVar: payloadString(payload, 'env_var'),
        profile,
        prompt: payloadString(payload, 'prompt'),
        requestId,
        sessionId
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

function queueMacosNotification(notification: ReturnType<typeof buildAssistantCompleteNotification>): void {
  void Promise.resolve(sendMacosNotification(notification)).catch(error => {
    console.warn('Failed to send macOS notification', error)
  })
}

function inputNeededNotificationText(eventType: GatewayEvent['type'], payload: GatewayPayload): string {
  if (eventType === 'clarify.request') {
    return firstText(payload.question)
  }

  if (eventType === 'approval.request') {
    return firstText(payload.description, payload.command)
  }

  if (eventType === 'sudo.request') {
    return 'Sudo password required'
  }

  if (eventType === 'secret.request') {
    return firstText(payload.prompt, payload.env_var)
  }

  return ''
}

function setBusy(sessionId: string, busy: boolean): void {
  const conversation = ensureConversationSession(sessionId)
  conversation.busy = busy
  setSessionWorking(sessionId, busy)
}

function setNeedsInput(sessionId: string, needsInput: boolean): void {
  const conversation = ensureConversationSession(sessionId)
  conversation.needsInput = needsInput
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

function newAttachmentId(prefix: string): string {
  nextMessageId += 1
  return `${prefix}-${Date.now()}-${nextMessageId}`
}

function displayForMessage(
  message: SessionMessage,
  role: ConversationMessageRole
): { attachments: ConversationAttachment[]; canvas: null | ConversationCanvas; text: string } {
  const rawText = firstText(message.text, message.content)
  const embedded = extractEmbeddedImages(rawText)
  const canvasDirectives =
    role === 'assistant'
      ? extractCanvasReferences(embedded.cleanedText)
      : { canvases: [], cleanedText: embedded.cleanedText, latestCanvas: null }
  const mediaDirectives = extractMediaDirectiveSources(canvasDirectives.cleanedText)
  const imageDirectives = extractImageDirectiveSources(mediaDirectives.cleanedText)
  const contentSources = role === 'user' ? imageSourcesFromContent(message.content) : []
  const sources = [
    ...[...embedded.images, ...imageDirectives.sources, ...contentSources].map(source => ({
      allowFileFallback: false,
      source
    })),
    ...mediaDirectives.sources.map(source => ({ allowFileFallback: true, source }))
  ]
  const seen = new Set<string>()
  const attachments: ConversationAttachment[] = []

  for (const { allowFileFallback, source } of sources) {
    const key = source.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)

    const attachment = attachmentFromMediaSource(key, 'stored-media', newAttachmentId, { allowFileFallback })
    if (attachment) attachments.push(attachment)
  }

  return { attachments, canvas: canvasDirectives.latestCanvas, text: imageDirectives.cleanedText }
}

function ensureParts(message: ConversationMessage): ConversationMessagePart[] {
  message.parts ??= []
  return message.parts
}

function buildAssistantPartsFromBuckets(reasoning: string[], text: string): ConversationMessagePart[] {
  const parts: ConversationMessagePart[] = []

  for (const block of reasoning) {
    if (block.trim()) {
      parts.push({ type: 'reasoning', text: block })
    }
  }

  if (text.trim()) {
    parts.push({ type: 'text', text })
  }

  return parts
}

function storedToolFromMessage(sessionId: string, message: SessionMessage, index: number): ConversationTool {
  const text = firstText(message.text, message.content)
  const name = message.tool_name || message.name || 'tool'

  return {
    context: firstText(message.context) || undefined,
    id: message.tool_call_id || `stored-tool-${sessionId}-${index}`,
    name,
    output: text,
    status: 'complete',
    summary: text || 'Tool completed'
  }
}

function normalizeStoredMessage(sessionId: string, message: SessionMessage, index: number): ConversationMessage {
  const role: ConversationMessageRole =
    message.role === 'assistant' || message.role === 'system' || message.role === 'tool' || message.role === 'user'
      ? message.role
      : 'assistant'
  const display = displayForMessage(message, role)
  const reasoning =
    coerceThinkingBlocks(message.codex_reasoning_items).length > 0
      ? coerceThinkingBlocks(message.codex_reasoning_items)
      : coerceThinkingBlocks(message.reasoning_details).length > 0
        ? coerceThinkingBlocks(message.reasoning_details)
        : coerceThinkingBlocks(message.reasoning ?? message.reasoning_content)

  if (role === 'tool') {
    const tool = storedToolFromMessage(sessionId, message, index)

    return {
      id: `stored-${sessionId}-${index}`,
      role,
      text: '',
      timestamp: message.timestamp,
      tools: [tool]
    }
  }

  return {
    attachments: display.attachments.length > 0 ? display.attachments : undefined,
    canvas: display.canvas ?? undefined,
    id: `stored-${sessionId}-${index}`,
    parts: buildAssistantPartsFromBuckets(reasoning, display.text),
    reasoning,
    role,
    text: display.text,
    timestamp: message.timestamp,
    tools: []
  }
}

function replaceStoredMessages(sessionId: string, messages: SessionMessage[]): void {
  const conversationId = displaySessionId(sessionId)
  const conversation = ensureConversationSession(conversationId)
  const result: ConversationMessage[] = []
  let lastAssistant: ConversationMessage | null = null
  let latestCanvas: ConversationCanvas | undefined

  for (let index = 0; index < messages.length; index += 1) {
    const normalized = normalizeStoredMessage(conversationId, messages[index], index)

    if (normalized.role === 'tool') {
      const tool = normalized.tools[0]

      if (lastAssistant && tool) {
        lastAssistant.tools.push(tool)
        ensureParts(lastAssistant).push({ type: 'tool', tool })
      } else if (tool) {
        result.push({
          ...normalized,
          parts: [{ type: 'tool', tool }]
        })
      }

      continue
    }

    if (normalized.role === 'assistant') {
      lastAssistant = normalized
      if (normalized.canvas) {
        latestCanvas = normalized.canvas
      }
    } else {
      lastAssistant = null
    }

    result.push(normalized)
  }

  conversation.messages = result
  conversation.canvas = latestCanvas
  conversation.currentAssistantId = null
  conversation.error = null
  conversation.hydrated = true
  conversation.loading = false
  conversation.busy = false
  conversation.needsInput = false
  setSessionWorking(conversationId, false)
  setSessionNeedsInput(conversationId, false)
}

function ensureAssistantMessage(sessionId: string): ConversationMessage {
  const conversation = ensureConversationSession(sessionId)
  const current = conversation.currentAssistantId
    ? conversation.messages.find(
        message => message.id === conversation.currentAssistantId && message.role === 'assistant'
      )
    : null

  if (current) {
    return current
  }

  const message: ConversationMessage = {
    id: newMessageId('assistant-stream'),
    parts: [],
    pending: true,
    reasoning: [],
    role: 'assistant',
    text: '',
    tools: []
  }

  conversation.currentAssistantId = message.id
  conversation.messages.push(message)

  return message
}

function beginAssistantMessage(sessionId: string): void {
  const conversation = ensureConversationSession(sessionId)
  const existing = conversation.currentAssistantId
    ? conversation.messages.find(message => message.id === conversation.currentAssistantId && message.pending)
    : null

  if (!existing) {
    const message: ConversationMessage = {
      id: newMessageId('assistant-stream'),
      parts: [],
      pending: true,
      reasoning: [],
      role: 'assistant',
      text: '',
      tools: []
    }

    conversation.currentAssistantId = message.id
    conversation.messages.push(message)
  }

  conversation.error = null
  setBusy(sessionId, true)
  setNeedsInput(sessionId, false)
}

function appendAssistantDelta(sessionId: string, delta: string): void {
  if (!delta) return

  const message = ensureAssistantMessage(sessionId)
  message.pending = true
  message.text += delta

  const parts = ensureParts(message)
  const lastPart = parts[parts.length - 1]

  if (lastPart?.type === 'text') {
    lastPart.text += delta
  } else {
    parts.push({ type: 'text', text: delta })
  }

  setBusy(sessionId, true)
}

const REASONING_GAP_MS = 1500

function appendReasoningDelta(sessionId: string, delta: string, replace = false): void {
  if (!delta) return

  const message = ensureAssistantMessage(sessionId)
  message.pending = true
  const parts = ensureParts(message)
  const blocks = message.reasoning ?? []
  const now = Date.now()
  const lastAt = lastReasoningAt.get(sessionId) ?? 0
  const gap = now - lastAt

  if (replace) {
    message.reasoning = [delta]
    message.parts = [{ type: 'reasoning', text: delta }, ...parts.filter(part => part.type !== 'reasoning')]
  } else if (blocks.length === 0 || gap > REASONING_GAP_MS) {
    blocks.push(delta)
    message.reasoning = blocks
    parts.push({ type: 'reasoning', text: delta })
  } else {
    blocks[blocks.length - 1] = `${blocks[blocks.length - 1]}${delta}`
    message.reasoning = blocks

    const lastPart = parts[parts.length - 1]

    if (lastPart?.type === 'reasoning') {
      lastPart.text = `${lastPart.text}${delta}`
    } else {
      parts.push({ type: 'reasoning', text: delta })
    }
  }

  lastReasoningAt.set(sessionId, now)
  setBusy(sessionId, true)
}

function toolStableId(payload: GatewayPayload): string {
  return firstText(payload.tool_id, payload.tool_call_id, payload.toolCallId, payload.id)
}

function toolMatchValues(payload: GatewayPayload): string[] {
  const values = [
    toolContext(payload),
    firstText(payload.preview, payload.query),
    firstText(payload.args, payload.input)
  ]

  return [...new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))]
}

function toolStoredMatchValues(tool: ConversationTool): string[] {
  const values = [tool.context ?? '', tool.input ?? '']

  return [...new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))]
}

function hasToolMatchOverlap(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) {
    return false
  }

  const rightSet = new Set(right)

  return left.some(value => rightSet.has(value))
}

function pickPendingTool(
  pending: ConversationTool[],
  status: ConversationToolStatus,
  matchValues: string[]
): ConversationTool | undefined {
  if (pending.length === 0) {
    return undefined
  }

  if (matchValues.length > 0) {
    const contextual = pending.find(tool => hasToolMatchOverlap(matchValues, toolStoredMatchValues(tool)))

    if (contextual) {
      return contextual
    }
  }

  if (pending.length === 1) {
    return pending[0]
  }

  return status === 'complete' ? pending[0] : pending[pending.length - 1]
}

function commitMessage(
  sessionId: string,
  messageId: string,
  transform: (message: ConversationMessage) => ConversationMessage
): void {
  const conversation = ensureConversationSession(sessionId)
  const index = conversation.messages.findIndex(message => message.id === messageId)

  if (index < 0) {
    return
  }

  conversation.messages[index] = transform(conversation.messages[index])
  conversation.messages = [...conversation.messages]
}

function findToolInConversation(
  sessionId: string,
  payload: GatewayPayload,
  status: ConversationToolStatus
): { message: ConversationMessage; tool: ConversationTool } | undefined {
  const stableId = toolStableId(payload)
  const payloadName = firstText(payload.name, payload.tool_name, payload.tool)
  const name = payloadName || 'tool'
  const matchValues = toolMatchValues(payload)
  const conversation = ensureConversationSession(sessionId)
  const orderedMessages: ConversationMessage[] = []

  if (conversation.currentAssistantId) {
    const current = conversation.messages.find(
      message => message.id === conversation.currentAssistantId && message.role === 'assistant'
    )

    if (current) {
      orderedMessages.push(current)
    }
  }

  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index]

    if (message.role !== 'assistant') continue
    if (orderedMessages.some(item => item.id === message.id)) continue

    orderedMessages.push(message)
  }

  for (const message of orderedMessages) {
    if (stableId) {
      const byId = message.tools.find(item => item.id === stableId)

      if (byId) {
        return { message, tool: byId }
      }
    }

    const pending = message.tools.filter(item => item.status === 'running')
    const pendingSameName = payloadName ? pending.filter(item => item.name === name) : []
    const candidates = pendingSameName.length > 0 ? pendingSameName : status === 'complete' ? pending : pendingSameName
    const tool = pickPendingTool(candidates, status, matchValues)

    if (tool) {
      return { message, tool }
    }
  }

  return undefined
}

function toolStatusFromEvent(eventType: GatewayEvent['type'], payload: GatewayPayload): ConversationToolStatus {
  if (eventType === 'tool.complete') {
    return 'complete'
  }

  const status = payloadString(payload, 'status').toLowerCase()

  if (status === 'completed' || status === 'complete' || status === 'done' || status === 'success') {
    return 'complete'
  }

  return 'running'
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

function upsertTool(sessionId: string, payload: GatewayPayload, status: ConversationToolStatus): void {
  const payloadName = firstText(payload.name, payload.tool_name, payload.tool)
  const name = payloadName || 'tool'
  const match = findToolInConversation(sessionId, payload, status)

  const context = toolContext(payload)
  const summary = toolSummary(payload)
  const input = firstText(payload.args, payload.input)
  const output = firstText(payload.output, payload.result)
  const error = firstText(payload.error)

  if (match) {
    const { message, tool: existing } = match
    const updated: ConversationTool = {
      ...existing,
      context: context || existing.context,
      error: error || existing.error,
      input: input || existing.input,
      name: payloadName || existing.name,
      output: output || existing.output,
      status,
      summary: summary || existing.summary || (status === 'complete' ? 'Tool completed' : 'Running')
    }

    commitMessage(sessionId, message.id, current => ({
      ...current,
      pending: status === 'running' || current.pending,
      tools: current.tools.map(tool => (tool.id === updated.id ? updated : tool)),
      parts: current.parts?.map(part =>
        part.type === 'tool' && part.tool.id === updated.id ? { type: 'tool', tool: updated } : part
      )
    }))
  } else {
    const message = ensureAssistantMessage(sessionId)
    const id = toolStableId(payload) || newToolId(name)
    const tool: ConversationTool = {
      context: context || undefined,
      error: error || undefined,
      id,
      input: input || undefined,
      name,
      output: output || undefined,
      status,
      summary: summary || (status === 'complete' ? 'Tool completed' : 'Running')
    }

    commitMessage(sessionId, message.id, current => ({
      ...current,
      pending: status === 'running' || current.pending,
      tools: [...current.tools, tool],
      parts: [...(current.parts ?? []), { type: 'tool', tool }]
    }))
  }

  if (status === 'running') {
    setBusy(sessionId, true)
  }
}

function completeAssistantMessage(sessionId: string, text: string, usage?: Partial<UsageStats>): void {
  const conversation = ensureConversationSession(sessionId)
  const display = displayForMessage({ content: text, role: 'assistant', text } as SessionMessage, 'assistant')
  const finalText = display.text.trim()
  const completionError = completionErrorText(finalText)
  const message =
    conversation.currentAssistantId && conversation.messages.some(item => item.id === conversation.currentAssistantId)
      ? ensureAssistantMessage(sessionId)
      : finalText || completionError || display.attachments.length > 0 || display.canvas
        ? ensureAssistantMessage(sessionId)
        : null

  if (message) {
    if (completionError) {
      message.error = completionError
      message.text = ''
      message.attachments = undefined
    } else {
      message.attachments = display.attachments.length > 0 ? display.attachments : message.attachments
      message.canvas = display.canvas ?? message.canvas
      if (display.canvas) {
        conversation.canvas = display.canvas
      }

      if (finalText && message.text !== finalText) {
        message.text = finalText

        const parts = ensureParts(message)
        let lastTextPart: Extract<ConversationMessagePart, { type: 'text' }> | null = null

        for (let index = parts.length - 1; index >= 0; index -= 1) {
          const part = parts[index]

          if (part.type === 'text') {
            lastTextPart = part
            break
          }
        }

        if (lastTextPart) {
          lastTextPart.text = finalText
        } else {
          parts.push({ type: 'text', text: finalText })
        }
      }
    }

    message.pending = false
    message.usage = usage ?? message.usage
  }

  if (usage) {
    conversation.usage = { ...(conversation.usage ?? {}), ...usage }
  }

  conversation.currentAssistantId = null
  conversation.error = null
  setBusy(sessionId, false)
  setNeedsInput(sessionId, false)
  queueMacosNotification(buildAssistantCompleteNotification({ error: completionError, sessionId, text: finalText }))
  void loadSessions().catch(() => undefined)
}

function failAssistantMessage(sessionId: string, errorMessage: string): void {
  const conversation = ensureConversationSession(sessionId)
  const message = ensureAssistantMessage(sessionId)

  message.error = errorMessage.trim() || 'Hermes reported an error'
  message.pending = false
  conversation.currentAssistantId = null
  conversation.error = message.error
  setBusy(sessionId, false)
  setNeedsInput(sessionId, false)
  queueMacosNotification(buildAssistantCompleteNotification({ error: message.error, sessionId }))
}

function usageFrom(payload: GatewayPayload): Partial<UsageStats> | undefined {
  return payload.usage && typeof payload.usage === 'object' && !Array.isArray(payload.usage)
    ? (payload.usage as Partial<UsageStats>)
    : undefined
}

function applyRuntimeInfo(sessionId: string, payload: GatewayPayload): void {
  const conversation = ensureConversationSession(sessionId)

  if (typeof payload.model === 'string') {
    conversation.model = payload.model
  }

  if (typeof payload.provider === 'string') {
    conversation.provider = payload.provider
  }

  if (typeof payload.reasoning_effort === 'string') {
    conversation.reasoningEffort = payload.reasoning_effort
  }

  if (typeof payload.fast === 'boolean') {
    conversation.fast = payload.fast
  }

  if (typeof payload.cwd === 'string') {
    conversation.cwd = payload.cwd
  }

  if (typeof payload.branch === 'string') {
    conversation.branch = payload.branch
  }

  const usage = usageFrom(payload)

  if (usage) {
    conversation.usage = { ...(conversation.usage ?? {}), ...usage }
  }

  if (typeof payload.running === 'boolean') {
    setBusy(sessionId, payload.running)
  }
}

function sessionIdForEvent(event: GatewayEvent): string | null {
  const sessionId = event.session_id || sessionState.activeSessionId
  return sessionId ? displaySessionId(sessionId) : null
}

export function conversationForSession(sessionId: string | null | undefined): ConversationSessionState | null {
  return sessionId ? (messageState.sessions[displaySessionId(sessionId)] ?? null) : null
}

export function shouldPreserveLiveConversation(sessionId: string, snapshotLength: number): boolean {
  const conversation = conversationForSession(sessionId)
  if (!conversation?.hydrated) return false

  if (conversation.busy || conversation.currentAssistantId) return true
  if (conversation.messages.some(message => message.pending)) return true
  if (conversation.messages.length > snapshotLength) return true

  return false
}

export function syncRunningFromResume(sessionId: string, info?: { running?: boolean }): void {
  if (typeof info?.running === 'boolean') {
    setConversationBusy(sessionId, info.running)
  }
}

export function setConversationBusy(sessionId: string, busy: boolean): void {
  setBusy(displaySessionId(sessionId), busy)
}

export function setConversationLoading(sessionId: string, loading: boolean): void {
  const conversationId = displaySessionId(sessionId)
  const conversation = ensureConversationSession(conversationId)
  conversation.loading = loading

  if (loading) {
    conversation.error = null
    return
  }

  if (conversation.messages.length === 0 && !conversation.hydrated && !conversation.busy) {
    delete messageState.sessions[conversationId]
  }
}

export function appendUserMessage(
  sessionId: string,
  text: string,
  attachmentInputs: ConversationAttachmentInput[] = []
): void {
  const conversationId = displaySessionId(sessionId)
  const conversation = ensureConversationSession(conversationId)
  const attachments = attachmentInputs.map(attachment => cloneConversationAttachment(attachment, newAttachmentId))
  const attachmentLines = attachments.map(attachment => `- ${attachmentDisplayLabel(attachment)}`).join('\n')
  const attachmentBlock = attachmentLines ? `\n\nAttached files:\n${attachmentLines}` : ''

  conversation.messages.push({
    attachments: attachments.length > 0 ? attachments : undefined,
    id: newMessageId('user'),
    role: 'user',
    text: `${text}${attachmentBlock}`.trim(),
    timestamp: Date.now(),
    tools: []
  })
  conversation.error = null
  conversation.hydrated = true
}

export function appendSystemMessage(sessionId: string, text: string): void {
  const message = text.trim()
  if (!message) return

  const conversation = ensureConversationSession(displaySessionId(sessionId))
  conversation.messages.push({
    id: newMessageId('system'),
    role: 'system',
    text: message,
    timestamp: Date.now(),
    tools: []
  })
  conversation.hydrated = true
}

export function appendAssistantErrorMessage(sessionId: string, text: string): void {
  const conversationId = displaySessionId(sessionId)
  const message = ensureAssistantMessage(conversationId)

  message.error = text.trim() || 'Hermes reported an error'
  message.pending = false
  message.text = message.text || ''
  ensureConversationSession(conversationId).currentAssistantId = null
  setBusy(conversationId, false)
  setNeedsInput(conversationId, false)
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

  noteSessionActivity(sessionId)

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
    upsertTool(sessionId, payload, toolStatusFromEvent(event.type, payload))
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
    queueMacosNotification(buildInputNeededNotification(inputNeededNotificationText(event.type, payload), sessionId))
  } else if (event.type === 'error') {
    clearAllPrompts()
    setNeedsInput(sessionId, false)
    failAssistantMessage(sessionId, firstText(payload.message, payload.error) || 'Hermes reported an error')
  }
}

export function startMessageStream(): void {
  if (gatewayStreamStarted) return

  configureGatewayRegistry({ onEvent: handleGatewayEvent })
  gatewayStreamStarted = true
}

export function stopMessageStream(): void {
  configureGatewayRegistry(null)
  gatewayStreamStarted = false
}
