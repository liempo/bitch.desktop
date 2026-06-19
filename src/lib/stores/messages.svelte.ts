import {
  buildAssistantCompleteNotification,
  buildInputNeededNotification,
  sendMacosNotification
} from '$lib/notifications/macos'
import { configureGatewayRegistry } from '$lib/stores/gateway.svelte'
import { extractCanvasReferences, type ThreadCanvas } from '$lib/canvas'
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
  coerceThinkingText,
  extractEmbeddedImages
} from '$lib/messages/chat-runtime'
import {
  attachmentDisplayLabel,
  attachmentFromMediaSource,
  cloneThreadAttachment,
  extractImageDirectiveSources,
  extractMediaDirectiveSources,
  imageSourcesFromContent,
  type ThreadAttachment,
  type ThreadAttachmentInput
} from '$lib/messages/media-attachments'
import type { SessionMessage, UsageStats } from '$lib/types/hermes'

export type { ThreadAttachment, ThreadAttachmentInput, ThreadAttachmentKind } from '$lib/messages/media-attachments'

type ThreadMessageRole = 'assistant' | 'system' | 'tool' | 'user'
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

type ThreadMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ThreadTool }

export interface ThreadMessage {
  attachments?: ThreadAttachment[]
  canvas?: ThreadCanvas
  error?: string
  id: string
  /** Chronological render order for assistant content. When present, the UI
   *  renders from this array instead of the legacy reasoning/tools/text buckets. */
  parts?: ThreadMessagePart[]
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
  canvas?: ThreadCanvas
  cwd?: string
  currentAssistantId: string | null
  error: string | null
  fast?: boolean
  hydrated: boolean
  loading: boolean
  messages: ThreadMessage[]
  model?: string
  needsInput: boolean
  provider?: string
  reasoningEffort?: string
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

let gatewayStreamStarted = false
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

function newAttachmentId(prefix: string): string {
  nextMessageId += 1
  return `${prefix}-${Date.now()}-${nextMessageId}`
}

function displayForMessage(
  message: SessionMessage,
  role: ThreadMessageRole
): { attachments: ThreadAttachment[]; canvas: null | ThreadCanvas; text: string } {
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
  const attachments: ThreadAttachment[] = []

  for (const { allowFileFallback, source } of sources) {
    const key = source.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)

    const attachment = attachmentFromMediaSource(key, 'stored-media', newAttachmentId, { allowFileFallback })
    if (attachment) attachments.push(attachment)
  }

  return { attachments, canvas: canvasDirectives.latestCanvas, text: imageDirectives.cleanedText }
}

function ensureParts(message: ThreadMessage): ThreadMessagePart[] {
  message.parts ??= []
  return message.parts
}

function buildAssistantPartsFromBuckets(reasoning: string[], text: string): ThreadMessagePart[] {
  const parts: ThreadMessagePart[] = []

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

function storedToolFromMessage(sessionId: string, message: SessionMessage, index: number): ThreadTool {
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

function normalizeStoredMessage(sessionId: string, message: SessionMessage, index: number): ThreadMessage {
  const role: ThreadMessageRole =
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
  const threadId = displaySessionId(sessionId)
  const thread = ensureThreadSession(threadId)
  const result: ThreadMessage[] = []
  let lastAssistant: ThreadMessage | null = null
  let latestCanvas: ThreadCanvas | undefined

  for (let index = 0; index < messages.length; index += 1) {
    const normalized = normalizeStoredMessage(threadId, messages[index], index)

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

  thread.messages = result
  thread.canvas = latestCanvas
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
    parts: [],
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
      parts: [],
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

function toolStoredMatchValues(tool: ThreadTool): string[] {
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
  pending: ThreadTool[],
  status: ThreadToolStatus,
  matchValues: string[]
): ThreadTool | undefined {
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
  transform: (message: ThreadMessage) => ThreadMessage
): void {
  const thread = ensureThreadSession(sessionId)
  const index = thread.messages.findIndex(message => message.id === messageId)

  if (index < 0) {
    return
  }

  thread.messages[index] = transform(thread.messages[index])
  thread.messages = [...thread.messages]
}

function findToolInThread(
  sessionId: string,
  payload: GatewayPayload,
  status: ThreadToolStatus
): { message: ThreadMessage; tool: ThreadTool } | undefined {
  const stableId = toolStableId(payload)
  const payloadName = firstText(payload.name, payload.tool_name, payload.tool)
  const name = payloadName || 'tool'
  const matchValues = toolMatchValues(payload)
  const thread = ensureThreadSession(sessionId)
  const orderedMessages: ThreadMessage[] = []

  if (thread.currentAssistantId) {
    const current = thread.messages.find(
      message => message.id === thread.currentAssistantId && message.role === 'assistant'
    )

    if (current) {
      orderedMessages.push(current)
    }
  }

  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index]

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

function toolStatusFromEvent(eventType: GatewayEvent['type'], payload: GatewayPayload): ThreadToolStatus {
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

function upsertTool(sessionId: string, payload: GatewayPayload, status: ThreadToolStatus): void {
  const payloadName = firstText(payload.name, payload.tool_name, payload.tool)
  const name = payloadName || 'tool'
  const match = findToolInThread(sessionId, payload, status)

  const context = toolContext(payload)
  const summary = toolSummary(payload)
  const input = firstText(payload.args, payload.input)
  const output = firstText(payload.output, payload.result)
  const error = firstText(payload.error)

  if (match) {
    const { message, tool: existing } = match
    const updated: ThreadTool = {
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
    const tool: ThreadTool = {
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
  const thread = ensureThreadSession(sessionId)
  const display = displayForMessage({ content: text, role: 'assistant', text } as SessionMessage, 'assistant')
  const finalText = display.text.trim()
  const completionError = completionErrorText(finalText)
  const message =
    thread.currentAssistantId && thread.messages.some(item => item.id === thread.currentAssistantId)
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
        thread.canvas = display.canvas
      }

      if (finalText) {
        const previous = compactWhitespace(message.text)
        const next = compactWhitespace(finalText)

        if (!previous || previous !== next) {
          message.text = finalText

          const parts = ensureParts(message)
          let lastTextPart: Extract<ThreadMessagePart, { type: 'text' }> | null = null

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
  queueMacosNotification(buildAssistantCompleteNotification({ error: completionError, text: finalText }))
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
  queueMacosNotification(buildAssistantCompleteNotification({ error: message.error }))
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

  if (typeof payload.reasoning_effort === 'string') {
    thread.reasoningEffort = payload.reasoning_effort
  }

  if (typeof payload.fast === 'boolean') {
    thread.fast = payload.fast
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

export function shouldPreserveLiveThread(sessionId: string, snapshotLength: number): boolean {
  const thread = threadForSession(sessionId)
  if (!thread?.hydrated) return false

  if (thread.busy || thread.currentAssistantId) return true
  if (thread.messages.some(message => message.pending)) return true
  if (thread.messages.length > snapshotLength) return true

  return false
}

export function syncRunningFromResume(sessionId: string, info?: { running?: boolean }): void {
  if (typeof info?.running === 'boolean') {
    setThreadBusy(sessionId, info.running)
  }
}

export function setThreadBusy(sessionId: string, busy: boolean): void {
  setBusy(displaySessionId(sessionId), busy)
}

export function setThreadLoading(sessionId: string, loading: boolean): void {
  const threadId = displaySessionId(sessionId)
  const thread = ensureThreadSession(threadId)
  thread.loading = loading

  if (loading) {
    thread.error = null
    return
  }

  if (thread.messages.length === 0 && !thread.hydrated && !thread.busy) {
    delete messageState.sessions[threadId]
  }
}

export function appendUserMessage(
  sessionId: string,
  text: string,
  attachmentInputs: ThreadAttachmentInput[] = []
): void {
  const threadId = displaySessionId(sessionId)
  const thread = ensureThreadSession(threadId)
  const attachments = attachmentInputs.map(attachment => cloneThreadAttachment(attachment, newAttachmentId))
  const attachmentLines = attachments.map(attachment => `- ${attachmentDisplayLabel(attachment)}`).join('\n')
  const attachmentBlock = attachmentLines ? `\n\nAttached files:\n${attachmentLines}` : ''

  thread.messages.push({
    attachments: attachments.length > 0 ? attachments : undefined,
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
    queueMacosNotification(buildInputNeededNotification(inputNeededNotificationText(event.type, payload)))
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
