import { getGlobalModelInfo, getModelOptions } from '$lib/api/dashboard'
import { compactWhitespace } from '$lib/messages/chat-runtime'
import { requestGateway } from '$lib/stores/gateway.svelte'
import { ensureGatewayProfile, normalizeProfileKey, profileState } from '$lib/stores/profile.svelte'
import {
  appendAssistantErrorMessage,
  appendSystemMessage,
  appendUserMessage,
  setThreadBusy,
  threadForSession
} from '$lib/stores/messages.svelte'
import {
  createSession,
  displaySessionIdFor,
  loadSessions,
  profileForSession,
  runtimeSessionIdForStored,
  sessionState
} from '$lib/stores/session.svelte'
import { navigate, routerState, sessionRoute } from '../../app/router.svelte'
import type { ModelInfoResponse, ModelOptionProvider, ModelOptionsResponse } from '$lib/types/hermes'

import { dequeueQueuedPrompt, enqueueQueuedPrompt, type QueuedPromptEntry } from './composer-queue'

export type ComposerAttachmentKind = 'image'

export interface ComposerAttachment {
  attachedSessionId?: string
  dataUrl: string
  detail?: string
  id: string
  kind: ComposerAttachmentKind
  label: string
  mediaType: string
  previewUrl?: string
  size: number
}

export interface CommandCatalogCategory {
  name: string
  pairs: [string, string][]
}

export interface CommandsCatalogResponse {
  canon?: Record<string, string>
  categories?: CommandCatalogCategory[]
  pairs?: [string, string][]
  skill_count?: number
  sub?: Record<string, string[]>
  warning?: string
}

export interface SlashCommandItem {
  category?: string
  command: string
  description: string
}

export interface SlashExecResponse {
  output?: string
  warning?: string
}

export interface PromptTextPart {
  text: string
  type: 'text'
}

export interface PromptImagePart {
  image_url: {
    detail?: 'auto' | 'high' | 'low'
    url: string
  }
  type: 'image_url'
}

export type PromptSubmitPayload = string | Array<PromptImagePart | PromptTextPart>

export interface ComposerSessionState {
  attachments: ComposerAttachment[]
  commandCatalog: SlashCommandItem[]
  commandError: null | string
  draft: string
  error: null | string
  loadingCommands: boolean
  submitting: boolean
  userInterrupted: boolean
}

export interface ComposerModelState {
  error: null | string
  info: ModelInfoResponse | null
  loading: boolean
  options: ModelOptionsResponse | null
  switching: boolean
}

export interface ComposerState {
  model: ComposerModelState
  sessions: Record<string, ComposerSessionState>
}

export interface SubmitPromptOptions {
  attachments?: ComposerAttachment[]
  fromQueue?: boolean
  text?: string
}

const NEW_SESSION_KEY = '__new__'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'])

export const composerState = $state<ComposerState>({
  model: {
    error: null,
    info: null,
    loading: false,
    options: null,
    switching: false
  },
  sessions: {}
})

let nextAttachmentId = 0

function sessionKey(sessionId: null | string | undefined): string {
  return sessionId?.trim() || NEW_SESSION_KEY
}

function displaySessionKey(sessionId: null | string | undefined): null | string {
  const key = sessionId?.trim()

  if (key) {
    return displaySessionIdFor(key)
  }

  return sessionState.storedSessionId
}

function commitActiveSessionRoute(): void {
  const storedKey = sessionState.storedSessionId
  if (!storedKey) return

  if (routerState.route === 'new' || routerState.sessionId !== storedKey) {
    navigate(sessionRoute(storedKey))
  }
}

function liveSessionKey(sessionId: null | string | undefined): null | string {
  const key = sessionId?.trim()

  if (key) {
    if (key === sessionState.activeSessionId) return key
    return (
      runtimeSessionIdForStored(key) ?? (key === sessionState.storedSessionId ? sessionState.activeSessionId : null)
    )
  }

  return sessionState.activeSessionId
}

function targetProfileForSession(sessionId: null | string | undefined): string {
  const displayKey = displaySessionKey(sessionId)
  return normalizeProfileKey(
    (displayKey ? profileForSession(displayKey) : null) ??
      profileState.newChatProfile ??
      profileState.activeGatewayProfile
  )
}

function ensureComposerSession(sessionId: null | string | undefined): ComposerSessionState {
  const key = sessionKey(sessionId)

  composerState.sessions[key] ??= {
    attachments: [],
    commandCatalog: [],
    commandError: null,
    draft: loadDraft(key),
    error: null,
    loadingCommands: false,
    submitting: false,
    userInterrupted: false
  }

  return composerState.sessions[key]
}

function draftStorageKey(key: string): string {
  return `bitch.desktop.composerDraft.v1.${key}`
}

function loadDraft(key: string): string {
  if (typeof window === 'undefined') return ''

  try {
    return window.localStorage.getItem(draftStorageKey(key)) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(key: string, value: string): void {
  if (typeof window === 'undefined') return

  try {
    if (value) {
      window.localStorage.setItem(draftStorageKey(key), value)
    } else {
      window.localStorage.removeItem(draftStorageKey(key))
    }
  } catch {
    // Draft persistence is best-effort only.
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function inlineErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback

  return (raw.match(/Error invoking remote method '[^']+': Error: (.+)$/)?.[1] ?? raw).replace(/^Error:\s*/, '').trim()
}

function isSessionBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /session busy/i.test(message)
}

function nextId(prefix: string): string {
  nextAttachmentId += 1
  return `${prefix}-${Date.now()}-${nextAttachmentId}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error(`Could not read ${file.name || 'image'}`))
      }
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error(`Could not read ${file.name || 'image'}`)))
    reader.readAsDataURL(file)
  })
}

function cloneAttachment(attachment: ComposerAttachment): ComposerAttachment {
  return { ...attachment }
}

function attachmentLabel(attachment: ComposerAttachment): string {
  return `${attachment.label} (${formatBytes(attachment.size)})`
}

function cloneAttachments(attachments: ComposerAttachment[]): ComposerAttachment[] {
  return attachments.map(cloneAttachment)
}

function buildPayload(text: string, attachments: ComposerAttachment[]): PromptSubmitPayload {
  const visibleText = text.trim()

  if (attachments.length === 0) {
    return visibleText
  }

  return [
    {
      text: visibleText || 'What do you see in this image?',
      type: 'text'
    },
    ...attachments.map(attachment => ({
      image_url: {
        detail: 'auto' as const,
        url: attachment.dataUrl
      },
      type: 'image_url' as const
    }))
  ]
}

function commandPairs(catalog: CommandsCatalogResponse): SlashCommandItem[] {
  const seen = new Set<string>()
  const items: SlashCommandItem[] = []

  for (const category of catalog.categories ?? []) {
    for (const [command, description] of category.pairs ?? []) {
      if (!command || seen.has(command)) continue
      seen.add(command)
      items.push({ category: category.name, command, description })
    }
  }

  for (const [command, description] of catalog.pairs ?? []) {
    if (!command || seen.has(command)) continue
    seen.add(command)
    items.push({ command, description })
  }

  return items
}

function modelSelectionKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`
}

function modelQuote(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value
}

function renderSlashOutput(command: string, result: SlashExecResponse | undefined): string {
  const output = result?.output?.trim() || '(no output)'
  const warning = result?.warning?.trim()

  return [`slash:${command}`, warning ? `warning: ${warning}` : '', output].filter(Boolean).join('\n')
}

export function composerForSession(sessionId: null | string | undefined): ComposerSessionState {
  return ensureComposerSession(sessionId)
}

export function setComposerDraft(sessionId: null | string | undefined, value: string): void {
  const key = sessionKey(sessionId)
  const session = ensureComposerSession(sessionId)

  session.draft = value
  session.error = null
  saveDraft(key, value)
}

export function clearComposerDraft(sessionId: null | string | undefined): void {
  setComposerDraft(sessionId, '')
}

export function clearComposerAttachments(sessionId: null | string | undefined): void {
  const session = ensureComposerSession(sessionId)
  session.attachments = []
}

export function removeComposerAttachment(sessionId: null | string | undefined, id: string): void {
  const session = ensureComposerSession(sessionId)
  session.attachments = session.attachments.filter(attachment => attachment.id !== id)
}

export async function addImageFiles(sessionId: null | string | undefined, files: FileList | File[]): Promise<void> {
  const session = ensureComposerSession(sessionId)
  session.error = null

  const candidates = Array.from(files)

  for (const file of candidates) {
    if (!file.type.startsWith('image/') || (IMAGE_TYPES.size > 0 && !IMAGE_TYPES.has(file.type))) {
      session.error = `${file.name || 'Selected file'} is not a supported image.`
      continue
    }

    if (file.size > MAX_IMAGE_BYTES) {
      session.error = `${file.name || 'Image'} is ${formatBytes(file.size)}. The composer currently accepts images up to ${formatBytes(MAX_IMAGE_BYTES)}.`
      continue
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const attachment: ComposerAttachment = {
        dataUrl,
        detail: formatBytes(file.size),
        id: nextId('image'),
        kind: 'image',
        label: file.name || 'image',
        mediaType: file.type || 'application/octet-stream',
        previewUrl: dataUrl,
        size: file.size
      }

      session.attachments = [...session.attachments, attachment]
    } catch (error) {
      session.error = messageFor(error)
    }
  }
}

export function markComposerInterrupted(sessionId: null | string | undefined, interrupted: boolean): void {
  ensureComposerSession(sessionId).userInterrupted = interrupted
}

export function queuedSessionKey(sessionId: null | string | undefined): null | string {
  return sessionId?.trim() || null
}

export function currentModelLabel(sessionId: null | string | undefined): string {
  const thread = threadForSession(sessionId)
  const provider = thread?.provider ?? composerState.model.info?.provider ?? composerState.model.options?.provider
  const model = thread?.model ?? composerState.model.info?.model ?? composerState.model.options?.model

  return [provider, model].filter(Boolean).join(' / ') || 'Model unavailable'
}

export function flattenedModelOptions(): Array<{ current: boolean; key: string; model: string; provider: string }> {
  const currentProvider = composerState.model.options?.provider ?? composerState.model.info?.provider ?? ''
  const currentModel = composerState.model.options?.model ?? composerState.model.info?.model ?? ''
  const providers = composerState.model.options?.providers ?? []

  return providers.flatMap((provider: ModelOptionProvider) =>
    (provider.models ?? []).map(model => ({
      current: (provider.slug || provider.name) === currentProvider && model === currentModel,
      key: modelSelectionKey(provider.slug || provider.name, model),
      model,
      provider: provider.slug || provider.name
    }))
  )
}

export async function refreshComposerModels(): Promise<void> {
  if (composerState.model.loading) return

  composerState.model.loading = true
  composerState.model.error = null

  try {
    const [info, options] = await Promise.allSettled([getGlobalModelInfo(), getModelOptions()])

    if (info.status === 'fulfilled') {
      composerState.model.info = info.value
    }

    if (options.status === 'fulfilled') {
      composerState.model.options = options.value
    }

    const rejection = info.status === 'rejected' ? info.reason : options.status === 'rejected' ? options.reason : null
    if (rejection) {
      composerState.model.error = messageFor(rejection)
    }
  } finally {
    composerState.model.loading = false
  }
}

export async function loadCommandCatalog(sessionId: null | string | undefined): Promise<void> {
  const displayKey = displaySessionKey(sessionId)
  const targetSessionId = liveSessionKey(sessionId)
  if (!displayKey || !targetSessionId) return

  const session = ensureComposerSession(displayKey)
  if (session.loadingCommands) return

  session.loadingCommands = true
  session.commandError = null

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    const catalog = await requestGateway<CommandsCatalogResponse>('commands.catalog', {
      session_id: targetSessionId,
      profile
    })
    session.commandCatalog = commandPairs(catalog)
    session.commandError = catalog.warning || null
  } catch (error) {
    session.commandError = messageFor(error)
  } finally {
    session.loadingCommands = false
  }
}

export function slashSuggestions(sessionId: null | string | undefined, draft: string): SlashCommandItem[] {
  const trimmed = draft.trimStart()
  if (!trimmed.startsWith('/')) return []

  const query = trimmed.slice(1).toLowerCase()
  const commandQuery = query.split(/\s+/, 1)[0]
  const catalog = composerState.sessions[sessionKey(sessionId)]?.commandCatalog ?? []

  return catalog.filter(item => item.command.toLowerCase().replace(/^\//, '').includes(commandQuery)).slice(0, 8)
}

export function applySlashSuggestion(sessionId: null | string | undefined, command: string): void {
  setComposerDraft(sessionId, `${command} `)
}

export async function executeSlashCommand(sessionId: null | string | undefined, rawCommand: string): Promise<boolean> {
  const command = rawCommand.trim()
  const displayKey = displaySessionKey(sessionId) ?? sessionId
  const composer = ensureComposerSession(displayKey)

  if (!command.startsWith('/')) return false

  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession()
  }

  if (!targetSessionId) {
    composer.error = 'Could not create a session for the slash command.'
    return false
  }

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    const result = await requestGateway<SlashExecResponse>('slash.exec', {
      command,
      session_id: targetSessionId,
      profile
    })
    appendSystemMessage(targetSessionId, renderSlashOutput(command, result))
    clearComposerDraft(sessionId)
    clearComposerAttachments(sessionId)
    commitActiveSessionRoute()
    void loadSessions().catch(() => undefined)

    return true
  } catch (error) {
    const message = inlineErrorMessage(error, 'Slash command failed')
    composer.error = message
    appendAssistantErrorMessage(targetSessionId, message)

    return false
  }
}

export async function selectComposerModel(sessionId: null | string | undefined, key: string): Promise<boolean> {
  const [provider, model] = key.split('\u0000')
  const targetSessionId = liveSessionKey(sessionId)

  if (!provider || !model || !targetSessionId) {
    composerState.model.error = 'Open a session before switching models.'
    return false
  }

  composerState.model.switching = true
  composerState.model.error = null

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    const command = `/model ${modelQuote(model)} --provider ${modelQuote(provider)}`
    const result = await requestGateway<SlashExecResponse>('slash.exec', {
      command,
      session_id: targetSessionId,
      profile
    })

    composerState.model.info = {
      ...(composerState.model.info ?? { model, provider }),
      model,
      provider
    }
    composerState.model.options = {
      ...(composerState.model.options ?? {}),
      model,
      provider
    }
    appendSystemMessage(targetSessionId, renderSlashOutput(command, result))

    return true
  } catch (error) {
    composerState.model.error = inlineErrorMessage(error, 'Model switch failed')
    return false
  } finally {
    composerState.model.switching = false
  }
}

export async function interruptComposerSession(sessionId: null | string | undefined): Promise<boolean> {
  const targetSessionId = liveSessionKey(sessionId)
  const displayKey = displaySessionKey(sessionId) ?? targetSessionId
  if (!targetSessionId || !displayKey) return false

  markComposerInterrupted(displayKey, true)
  setThreadBusy(displayKey, false)

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    await requestGateway('session.interrupt', { session_id: targetSessionId, profile })
    appendSystemMessage(displayKey, 'Interrupted by operator.')
    return true
  } catch (error) {
    const message = inlineErrorMessage(error, 'Stop failed')
    ensureComposerSession(displayKey).error = message
    appendAssistantErrorMessage(displayKey, message)
    return false
  }
}

export async function submitPrompt(
  sessionId: null | string | undefined,
  options: SubmitPromptOptions = {}
): Promise<boolean> {
  const composer = ensureComposerSession(sessionId)
  const rawText = options.text ?? composer.draft
  const visibleText = rawText.trim()
  const attachments = cloneAttachments(options.attachments ?? composer.attachments)
  const hasPayload = Boolean(visibleText || attachments.length)

  if (!hasPayload) return false

  const activeThread = threadForSession(sessionId)

  if (!options.fromQueue && sessionId && activeThread?.busy) {
    const entry = enqueueQueuedPrompt(sessionId, { attachments, text: visibleText })

    if (entry) {
      clearComposerDraft(sessionId)
      clearComposerAttachments(sessionId)
      composer.error = null
      return true
    }
  }

  composer.submitting = true
  composer.error = null

  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession()
  }

  if (!targetSessionId) {
    composer.submitting = false
    composer.error = 'Could not create a session.'
    return false
  }

  const attachmentLines = attachments.map(attachmentLabel)
  const displayText = compactWhitespace(visibleText) || (attachments.length ? 'What do you see in this image?' : '')
  const targetProfile = targetProfileForSession(sessionId)

  try {
    await ensureGatewayProfile(targetProfile)
  } catch (error) {
    composer.submitting = false
    composer.error = inlineErrorMessage(error, 'Could not switch profile gateway')
    return false
  }

  appendUserMessage(targetSessionId, displayText, attachmentLines)
  setThreadBusy(targetSessionId, true)
  commitActiveSessionRoute()

  if (!options.fromQueue) {
    clearComposerDraft(sessionId)
    clearComposerAttachments(sessionId)
  }

  try {
    await requestGateway('prompt.submit', {
      session_id: targetSessionId,
      text: buildPayload(visibleText, attachments),
      profile: targetProfile
    })
    void loadSessions().catch(() => undefined)

    return true
  } catch (error) {
    if (isSessionBusyError(error)) {
      const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
      setThreadBusy(displayKey, true)

      const thread = threadForSession(displayKey)
      if (thread?.messages.at(-1)?.role === 'user') {
        thread.messages.pop()
      }

      const queueKey = sessionId ?? displayKey
      enqueueQueuedPrompt(queueKey, { attachments, text: visibleText })
      composer.error = null

      return true
    }

    const message = inlineErrorMessage(error, 'Prompt failed')
    setThreadBusy(targetSessionId, false)
    appendAssistantErrorMessage(targetSessionId, message)
    composer.error = message

    return false
  } finally {
    composer.submitting = false
  }
}

export async function drainNextQueuedPrompt(sessionId: null | string | undefined): Promise<boolean> {
  const key = queuedSessionKey(sessionId)
  if (!key) return false

  const thread = threadForSession(key)
  if (thread?.busy) return false

  const entry: QueuedPromptEntry | null = dequeueQueuedPrompt(key)
  if (!entry) return false

  return submitPrompt(key, {
    attachments: entry.attachments,
    fromQueue: true,
    text: entry.text
  })
}
