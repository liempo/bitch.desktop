import type { ModelInfoResponse, UsageStats } from '$lib/types/hermes'

export type ContextStatusTone = 'active' | 'available' | 'unavailable' | 'warning'

export interface ContextStatusRow {
  label: string
  tone: ContextStatusTone
  value: string
}

export interface ContextStatusSection {
  id: string
  rows: ContextStatusRow[]
  title: string
}

export interface ContextStatusTrigger {
  label: string
  title: string
  tone: ContextStatusTone
}

export interface ContextStatusViewModel {
  sections: ContextStatusSection[]
  summary: string
  trigger: ContextStatusTrigger
}

export interface ContextStatusConversationInput {
  branch?: null | string
  busy?: boolean
  cwd?: null | string
  fast?: boolean
  model?: null | string
  provider?: null | string
  reasoningEffort?: null | string
  usage?: null | Partial<UsageStats>
}

export interface ContextStatusSessionInput {
  id?: null | string
  input_tokens?: null | number
  is_active?: boolean
  message_count?: null | number
  model?: null | string
  output_tokens?: null | number
  tool_call_count?: null | number
}

export interface ContextStatusInput {
  attachmentsCount?: number
  connected: boolean
  conversation?: ContextStatusConversationInput | null
  lineageSegmentCount?: number
  modelError?: null | string
  modelInfo?: ModelInfoResponse | null
  profileName?: null | string
  runtimeSessionId?: null | string
  selectedSession?: ContextStatusSessionInput | null
  sessionId?: null | string
  storedSessionId?: null | string
}

interface ContextUsageSummary {
  available: boolean
  percentLabel?: string
  triggerLabel: string
  value: string
}

function clean(value: null | string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

function finiteNumber(value: null | number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${trimTrailingZero((value / 1_000_000).toFixed(1))}M`
  if (abs >= 1_000) return `${trimTrailingZero((value / 1_000).toFixed(1))}K`
  return `${value}`
}

function trimTrailingZero(value: string): string {
  return value.replace(/\.0$/, '')
}

function formatPercent(value: number): string {
  return `${trimTrailingZero(value.toFixed(1))}%`
}

function unavailable(reason: string): string {
  return `unavailable — ${reason}`
}

function modelLabel(input: ContextStatusInput): string {
  const conversationModel = clean(input.conversation?.model)
  const conversationProvider = clean(input.conversation?.provider)
  if (conversationModel && conversationProvider) return `${conversationProvider} / ${conversationModel}`
  if (conversationModel) return conversationModel

  const infoModel = clean(input.modelInfo?.model)
  const infoProvider = clean(input.modelInfo?.provider)
  if (infoModel && infoProvider) return `${infoProvider} / ${infoModel}`
  if (infoModel) return infoModel

  const sessionModel = clean(input.selectedSession?.model)
  if (sessionModel) return sessionModel

  const modelError = clean(input.modelError)
  if (modelError) return unavailable(modelError)

  return unavailable('model not reported')
}

function statusLabel(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  if (!input.connected) return { tone: 'unavailable', value: 'gateway disconnected' }
  if (input.conversation?.busy) return { tone: 'active', value: 'running' }
  if (input.selectedSession?.is_active) return { tone: 'available', value: 'active' }
  if (clean(input.sessionId)) return { tone: 'available', value: 'idle' }
  return { tone: 'unavailable', value: 'no active session' }
}

function sessionLabel(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  const sessionId = clean(input.sessionId) ?? clean(input.selectedSession?.id) ?? clean(input.storedSessionId)
  const runtimeId = clean(input.runtimeSessionId)

  if (!sessionId) return { tone: 'unavailable', value: 'no active session' }
  if (runtimeId && runtimeId !== sessionId) return { tone: 'available', value: `${sessionId} → ${runtimeId}` }
  return { tone: 'available', value: sessionId }
}

function profileLabel(profileName: null | string | undefined): { tone: ContextStatusTone; value: string } {
  const profile = clean(profileName)
  return profile
    ? { tone: 'available', value: profile }
    : { tone: 'unavailable', value: unavailable('no profile selected') }
}

function contextUsage(input: ContextStatusInput): ContextUsageSummary {
  const sessionId = clean(input.sessionId) ?? clean(input.selectedSession?.id) ?? clean(input.storedSessionId)
  if (!sessionId) {
    return {
      available: false,
      triggerLabel: 'CTX N/A',
      value: unavailable('no active session')
    }
  }

  const usage = input.conversation?.usage
  const used = finiteNumber(usage?.context_used)
  const max = finiteNumber(usage?.context_max) ?? finiteNumber(input.modelInfo?.effective_context_length)
  const reportedPercent = finiteNumber(usage?.context_percent)
  const computedPercent = used != null && max ? (used / max) * 100 : null
  const percent = reportedPercent ?? computedPercent

  if (used != null && max != null && percent != null) {
    const percentLabel = formatPercent(percent)
    return {
      available: true,
      percentLabel,
      triggerLabel: `CTX ${percentLabel}`,
      value: `${formatCompactNumber(used)} / ${formatCompactNumber(max)} tokens (${percentLabel})`
    }
  }

  return {
    available: false,
    triggerLabel: 'CTX ?',
    value: unavailable('no context usage reported by Hermes dashboard/gateway')
  }
}

function messageTokens(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  const usage = input.conversation?.usage
  const inputTokens = finiteNumber(usage?.input) ?? finiteNumber(input.selectedSession?.input_tokens)
  const outputTokens = finiteNumber(usage?.output) ?? finiteNumber(input.selectedSession?.output_tokens)
  const totalTokens =
    finiteNumber(usage?.total) ??
    (inputTokens != null || outputTokens != null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null)

  if (inputTokens == null && outputTokens == null && totalTokens == null) {
    return { tone: 'unavailable', value: unavailable('no stored session token counters') }
  }

  return {
    tone: 'available',
    value: `${formatCompactNumber(inputTokens ?? 0)} in / ${formatCompactNumber(outputTokens ?? 0)} out / ${formatCompactNumber(totalTokens ?? 0)} total`
  }
}

function modelContext(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  const effective = finiteNumber(input.modelInfo?.effective_context_length)
  if (effective == null) {
    return { tone: 'unavailable', value: unavailable('/api/model/info has not returned context length') }
  }

  const details = [
    finiteNumber(input.modelInfo?.config_context_length) != null
      ? `${formatCompactNumber(input.modelInfo?.config_context_length as number)} config`
      : '',
    finiteNumber(input.modelInfo?.auto_context_length) != null
      ? `${formatCompactNumber(input.modelInfo?.auto_context_length as number)} auto`
      : ''
  ].filter(Boolean)

  return {
    tone: 'available',
    value: `${formatCompactNumber(effective)} effective${details.length ? ` (${details.join(', ')})` : ''}`
  }
}

function reasoningLabel(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  const parts = []
  const effort = clean(input.conversation?.reasoningEffort)
  if (effort) parts.push(effort)
  if (typeof input.conversation?.fast === 'boolean') parts.push(input.conversation.fast ? 'fast on' : 'fast off')

  if (parts.length === 0) {
    return { tone: 'unavailable', value: unavailable('runtime did not report reasoning or fast mode') }
  }

  return { tone: 'available', value: parts.join(' · ') }
}

function workspaceLabel(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  const cwd = clean(input.conversation?.cwd)
  const branch = clean(input.conversation?.branch)
  if (cwd && branch) return { tone: 'available', value: `${cwd} @ ${branch}` }
  if (cwd) return { tone: 'available', value: cwd }
  if (branch) return { tone: 'available', value: `branch ${branch}` }
  return { tone: 'unavailable', value: unavailable('runtime did not report cwd or branch') }
}

function compressionLabel(input: ContextStatusInput): { tone: ContextStatusTone; value: string } {
  const sessionId = clean(input.sessionId) ?? clean(input.selectedSession?.id) ?? clean(input.storedSessionId)
  if (!sessionId) return { tone: 'unavailable', value: unavailable('no active session lineage') }

  const segments = Math.max(0, input.lineageSegmentCount ?? 0)
  if (segments > 1) {
    return {
      tone: 'warning',
      value: `lineage visible (${segments} segments); exact compression state unavailable`
    }
  }

  return { tone: 'unavailable', value: unavailable('Hermes has not reported compression state') }
}

function attachmentLabel(count: number | undefined): { tone: ContextStatusTone; value: string } {
  const safeCount = Math.max(0, Math.floor(count ?? 0))
  if (safeCount === 0) return { tone: 'available', value: 'none staged' }
  return { tone: 'available', value: `${safeCount} staged` }
}

function row(label: string, data: { tone: ContextStatusTone; value: string }): ContextStatusRow {
  return { label, tone: data.tone, value: data.value }
}

export function buildContextStatusViewModel(input: ContextStatusInput): ContextStatusViewModel {
  const context = contextUsage(input)
  const status = statusLabel(input)
  const model = modelLabel(input)
  const modelTone: ContextStatusTone = model.startsWith('unavailable') ? 'unavailable' : 'available'
  const summaryPrefix = !input.connected ? 'gateway disconnected' : model
  const summary = `${summaryPrefix} · ${context.available ? context.value : 'context usage unavailable'}`
  const triggerTone: ContextStatusTone =
    !input.connected || context.triggerLabel === 'CTX N/A'
      ? 'unavailable'
      : context.available
        ? status.tone === 'active'
          ? 'active'
          : 'available'
        : 'warning'

  return {
    sections: [
      {
        id: 'runtime',
        title: 'Runtime',
        rows: [
          row('Status', status),
          row('Profile', profileLabel(input.profileName)),
          row('Session', sessionLabel(input)),
          row('Model', { tone: modelTone, value: model }),
          row('Reasoning', reasoningLabel(input))
        ]
      },
      {
        id: 'tokens',
        title: 'Context',
        rows: [
          row('Context usage', {
            tone: context.available ? 'available' : context.triggerLabel === 'CTX N/A' ? 'unavailable' : 'warning',
            value: context.value
          }),
          row('Message tokens', messageTokens(input)),
          row('Model context', modelContext(input)),
          row('Compression', compressionLabel(input))
        ]
      },
      {
        id: 'session',
        title: 'Session',
        rows: [row('Attachments', attachmentLabel(input.attachmentsCount)), row('Workspace', workspaceLabel(input))]
      }
    ],
    summary,
    trigger: {
      label: context.triggerLabel,
      title: `Context usage: ${context.available ? context.value : 'unavailable'}`,
      tone: triggerTone
    }
  }
}
