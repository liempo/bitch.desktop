export type ConversationTimelineMarkerKind =
  | 'approval'
  | 'assistant'
  | 'clarify'
  | 'error'
  | 'input'
  | 'media'
  | 'tool-heavy'
  | 'user'

export type ConversationTimelinePromptKind = 'approval' | 'clarify' | 'input'

export interface ConversationTimelineTool {
  id: string
  name: string
  status: string
  summary: string
}

export interface ConversationTimelineAttachment {
  id?: string
  kind?: string
  label?: string
  path?: string
  url?: string
}

export interface ConversationTimelineMessagePart {
  text?: string
  tool?: ConversationTimelineTool
  type: string
}

export interface ConversationTimelineMessage {
  attachments?: ConversationTimelineAttachment[]
  canvas?: unknown
  error?: string
  id: string
  parts?: ConversationTimelineMessagePart[]
  pending?: boolean
  reasoning?: string[]
  role: 'assistant' | 'system' | 'tool' | 'user'
  text: string
  timestamp?: number
  tools: ConversationTimelineTool[]
}

export interface ConversationTimelineOptions {
  pendingPrompt?: ConversationTimelinePromptKind | null
  promptAnchorId?: string
  toolHeavyThreshold?: number
}

export interface ConversationTimelineMarker {
  description: string
  id: string
  kind: ConversationTimelineMarkerKind
  label: string
  messageId: string
  messageIndex: number
}

const DEFAULT_TOOL_HEAVY_THRESHOLD = 2
const DEFAULT_PROMPT_ANCHOR_ID = 'conversation-prompt'
const MEDIA_REFERENCE_RE = /(?:\bMEDIA\s*:|\bCANVAS\s*:|@(file|image|media)\s*:)/i

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, maxLength = 72): string {
  const compacted = compactWhitespace(value)
  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function partText(part: ConversationTimelineMessagePart): string {
  if (part.type === 'tool') {
    return part.tool ? `${part.tool.name} ${part.tool.summary}` : ''
  }

  return part.text ?? ''
}

function messageSearchText(message: ConversationTimelineMessage): string {
  const partTextValue = message.parts?.map(partText).join('\n') ?? ''
  const reasoningText = message.reasoning?.join('\n') ?? ''
  const attachmentText =
    message.attachments?.map(attachment => attachment.label ?? attachment.path ?? attachment.url ?? '').join('\n') ?? ''

  return [message.text, partTextValue, reasoningText, attachmentText].filter(Boolean).join('\n')
}

function messageDescription(message: ConversationTimelineMessage, fallback: string): string {
  return truncate(message.text || message.parts?.map(partText).find(text => text.trim()) || fallback)
}

function mediaDescription(message: ConversationTimelineMessage): string {
  const labels = message.attachments
    ?.map(attachment => attachment.label || attachment.path || attachment.url || '')
    .filter(label => label.trim())

  if (labels?.length) {
    return truncate(labels.join(', '), 64)
  }

  if (message.canvas) return 'Canvas reference'
  return 'File/media reference'
}

function hasMediaReference(message: ConversationTimelineMessage): boolean {
  return Boolean(
    (message.attachments?.length ?? 0) > 0 || message.canvas || MEDIA_REFERENCE_RE.test(messageSearchText(message))
  )
}

function promptLabel(kind: ConversationTimelinePromptKind): string {
  if (kind === 'approval') return 'Approval required'
  if (kind === 'clarify') return 'Clarification needed'
  return 'Input needed'
}

function pushMarker(
  markers: ConversationTimelineMarker[],
  kind: ConversationTimelineMarkerKind,
  message: ConversationTimelineMessage,
  messageIndex: number,
  label: string,
  description: string
): void {
  markers.push({
    description,
    id: `${kind}:${message.id}`,
    kind,
    label,
    messageId: message.id,
    messageIndex
  })
}

export function extractConversationTimelineMarkers(
  messages: readonly ConversationTimelineMessage[],
  options: ConversationTimelineOptions = {}
): ConversationTimelineMarker[] {
  const markers: ConversationTimelineMarker[] = []
  const toolHeavyThreshold = Math.max(1, options.toolHeavyThreshold ?? DEFAULT_TOOL_HEAVY_THRESHOLD)

  messages.forEach((message, messageIndex) => {
    if (message.role === 'user') {
      pushMarker(markers, 'user', message, messageIndex, 'User prompt', messageDescription(message, 'User prompt'))
    }

    if (message.role === 'assistant') {
      if (message.error) {
        pushMarker(markers, 'error', message, messageIndex, 'Transcript error', truncate(message.error))
      } else {
        pushMarker(
          markers,
          'assistant',
          message,
          messageIndex,
          'Assistant reply',
          messageDescription(message, 'Assistant reply')
        )
      }

      if (message.tools.length >= toolHeavyThreshold) {
        pushMarker(markers, 'tool-heavy', message, messageIndex, 'Tool-heavy turn', `${message.tools.length} tools`)
      }
    }

    if (hasMediaReference(message)) {
      pushMarker(markers, 'media', message, messageIndex, 'Media reference', mediaDescription(message))
    }
  })

  if (options.pendingPrompt) {
    const kind = options.pendingPrompt
    markers.push({
      description: '',
      id: `${kind}:${options.promptAnchorId ?? DEFAULT_PROMPT_ANCHOR_ID}`,
      kind,
      label: promptLabel(kind),
      messageId: options.promptAnchorId ?? DEFAULT_PROMPT_ANCHOR_ID,
      messageIndex: messages.length
    })
  }

  return markers
}
