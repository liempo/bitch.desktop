import { coerceGatewayText } from './message-normalization'

export const DEFAULT_TRANSCRIPT_VISIBLE_LINES = 600

export type RemoteToolTranscriptStatus = 'complete' | 'running'
export type RemoteToolTranscriptStream = 'stderr' | 'stdout'
export type RemoteToolExitStatus = number | string

export interface RemoteToolTranscriptChunk {
  stream: RemoteToolTranscriptStream
  text: string
}

export interface RemoteToolTranscriptSource {
  completedAt?: number
  context?: string
  error?: string
  exitStatus?: RemoteToolExitStatus
  id: string
  input?: string
  name: string
  output?: string
  startedAt?: number
  status: RemoteToolTranscriptStatus
  stderr?: string
  stdout?: string
  summary: string
}

export interface RemoteToolTranscript {
  clippedLineCount: number
  command?: string
  completedAt?: number
  copyText: string
  chunks: RemoteToolTranscriptChunk[]
  exitStatus?: RemoteToolExitStatus
  id: string
  startedAt?: number
  status: RemoteToolTranscriptStatus
  title: string
  toolId: string
  toolName: string
  totalLineCount: number
  visibleLineCount: number
  visibleText: string
}

export interface RemoteToolTranscriptOptions {
  maxVisibleLines?: number
}

export interface RemoteToolTranscriptPayloadFields {
  completedAt?: number
  exitStatus?: RemoteToolExitStatus
  startedAt?: number
  stderr?: string
  stdout?: string
  timestamp?: number
}

type ToolMessageLike = {
  tools?: RemoteToolTranscriptSource[]
}

type PayloadLike = Record<string, unknown>

function compactCommand(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
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

function maybeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return undefined
}

function maybeExitStatus(value: unknown): RemoteToolExitStatus | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : value.trim()
  }
  return undefined
}

function humanizeToolName(name: string): string {
  const normalized = name.replace(/[_-]+/g, ' ').trim()
  if (!normalized) return 'Tool'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function transcriptLabel(tool: RemoteToolTranscriptSource): string {
  const command = compactCommand(tool.context || tool.input || '')
  const prefix = humanizeToolName(tool.name)

  if (!command) return prefix
  if (command.length <= 60) return `${prefix} · ${command}`
  return `${prefix} · ${command.slice(0, 57)}…`
}

function linesFor(text: string): string[] {
  if (!text) return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function clipNewestLines(
  text: string,
  maxVisibleLines: number
): {
  clippedLineCount: number
  totalLineCount: number
  visibleLineCount: number
  visibleText: string
} {
  const lines = linesFor(text)
  const totalLineCount = lines.length

  if (totalLineCount <= maxVisibleLines) {
    return { clippedLineCount: 0, totalLineCount, visibleLineCount: totalLineCount, visibleText: text }
  }

  const visible = lines.slice(totalLineCount - maxVisibleLines)
  return {
    clippedLineCount: totalLineCount - visible.length,
    totalLineCount,
    visibleLineCount: visible.length,
    visibleText: visible.join('\n')
  }
}

function chunkText(chunks: RemoteToolTranscriptChunk[], labelled: boolean): string {
  return chunks
    .map(chunk => {
      const text = chunk.text.trimEnd()
      return labelled ? `[${chunk.stream}]\n${text}` : text
    })
    .filter(Boolean)
    .join('\n\n')
}

function copyTextFor(tool: RemoteToolTranscriptSource, chunks: RemoteToolTranscriptChunk[]): string {
  const command = compactCommand(tool.context || tool.input || '')
  const header = [
    `# ${transcriptLabel(tool)}`,
    command ? `$ ${command}` : '',
    tool.startedAt ? `[started] ${tool.startedAt}` : '',
    tool.completedAt ? `[completed] ${tool.completedAt}` : '',
    tool.exitStatus !== undefined ? `[exit] ${tool.exitStatus}` : '',
    `[status] ${tool.status}`
  ].filter(Boolean)
  const body = chunkText(chunks, true)

  return [header.join('\n'), body].filter(Boolean).join('\n\n')
}

export function remoteToolTranscriptFieldsFromPayload(payload: PayloadLike): RemoteToolTranscriptPayloadFields {
  const timestamp = maybeNumber(payload.timestamp ?? payload.time ?? payload.created_at ?? payload.createdAt)
  const exitStatus = maybeExitStatus(
    payload.exit_status ??
      payload.exitStatus ??
      payload.exit_code ??
      payload.exitCode ??
      payload.return_code ??
      payload.returnCode ??
      payload.returncode ??
      payload.code
  )
  const stdout = firstText(payload.stdout, payload.output, payload.result, payload.chunk)
  const stderr = firstText(payload.stderr)
  const fields: RemoteToolTranscriptPayloadFields = {}

  if (stdout) fields.stdout = stdout
  if (stderr) fields.stderr = stderr
  if (exitStatus !== undefined) fields.exitStatus = exitStatus
  if (timestamp !== undefined) fields.timestamp = timestamp

  return fields
}

export function canOpenRemoteToolTranscript(tool: RemoteToolTranscriptSource): boolean {
  return Boolean(
    tool.context ||
    tool.input ||
    tool.output ||
    tool.stdout ||
    tool.stderr ||
    tool.error ||
    tool.summary ||
    tool.status === 'running'
  )
}

export function buildRemoteToolTranscript(
  sessionId: string,
  tool: RemoteToolTranscriptSource,
  options: RemoteToolTranscriptOptions = {}
): RemoteToolTranscript | null {
  if (!canOpenRemoteToolTranscript(tool)) return null

  const stdout = tool.stdout || tool.output || ''
  const stderr = tool.stderr || tool.error || ''
  const chunks: RemoteToolTranscriptChunk[] = []

  if (stdout) chunks.push({ stream: 'stdout', text: stdout })
  if (stderr) chunks.push({ stream: 'stderr', text: stderr })

  const visibleSource = chunkText(chunks, chunks.length > 1)
  const clipped = clipNewestLines(visibleSource, options.maxVisibleLines ?? DEFAULT_TRANSCRIPT_VISIBLE_LINES)

  return {
    ...clipped,
    command: compactCommand(tool.context || tool.input || '') || undefined,
    completedAt: tool.completedAt,
    copyText: copyTextFor(tool, chunks),
    chunks,
    exitStatus: tool.exitStatus,
    id: `${sessionId}:${tool.id}`,
    startedAt: tool.startedAt,
    status: tool.status,
    title: transcriptLabel(tool),
    toolId: tool.id,
    toolName: tool.name
  }
}

export function extractRemoteToolTranscriptsFromMessages(
  sessionId: string,
  messages: ToolMessageLike[],
  options: RemoteToolTranscriptOptions = {}
): RemoteToolTranscript[] {
  const transcripts: RemoteToolTranscript[] = []

  for (const message of messages) {
    for (const tool of message.tools ?? []) {
      const transcript = buildRemoteToolTranscript(sessionId, tool, options)
      if (transcript) transcripts.push(transcript)
    }
  }

  return transcripts
}
