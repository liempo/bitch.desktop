import { getGlobalModelInfo, getModelOptions, getProfiles } from '$lib/api/dashboard'
import { messageForError } from '$lib/errors'
import {
  commandNotFoundMessage,
  commandPairs,
  isCommandNotFoundError,
  isReloadMcpCommand,
  parseCommandDispatch,
  parseSlashCommand,
  renderSlashOutput,
  shouldDispatchSlashImmediately,
  slashExecCommand,
  type CommandsCatalogResponse,
  type SlashCommandItem,
  type SlashExecResponse
} from '$lib/composer/slash-commands'
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
  sessionState,
  startNewSession,
  threadIdForSessionId
} from '$lib/stores/session.svelte'
import { navigate, routerState, sessionRoute } from '@/app/agent/router.svelte'
import type { ModelInfoResponse, ModelOptionProvider, ModelOptionsResponse } from '$lib/types/hermes'

import { dequeueQueuedPrompt, enqueueQueuedPrompt, type QueuedPromptEntry } from './composer-queue'

export { shouldDispatchSlashImmediately }
export type { SlashCommandItem }

type ComposerAttachmentKind = 'audio' | 'file' | 'image' | 'pdf' | 'video'

export interface ComposerAttachment {
  attachedSessionId?: string
  dataUrl: string
  detail?: string
  id: string
  kind: ComposerAttachmentKind
  label: string
  mediaType: string
  path?: string
  previewUrl?: string
  refText?: string
  size: number
}

interface AttachmentRelayResponse {
  attached?: boolean
  bytes?: number
  count?: number
  filename?: string
  message?: string
  path?: string
  ref_text?: string
  text?: string
}

export interface ComposerModelOption {
  capabilities?: NonNullable<ModelOptionProvider['capabilities']>[string]
  current: boolean
  key: string
  model: string
  pricing?: NonNullable<ModelOptionProvider['pricing']>[string]
  provider: string
  unavailable: boolean
}

export interface ComposerModelGroup {
  freeTier?: boolean
  name: string
  options: ComposerModelOption[]
  provider: string
  warning?: string
}

export type ReasoningEffort = 'high' | 'low' | 'medium' | 'minimal' | 'none' | 'xhigh'

interface ThreadModelSelection {
  model: string
  provider: string
}

type PromptSubmitPayload = string

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

interface ComposerModelState {
  error: null | string
  fastSwitching: boolean
  info: ModelInfoResponse | null
  loading: boolean
  options: ModelOptionsResponse | null
  reasoningSwitching: boolean
  switching: boolean
}

export interface ComposerState {
  model: ComposerModelState
  sessions: Record<string, ComposerSessionState>
  threadFastSelections: Record<string, boolean>
  threadModelSelections: Record<string, ThreadModelSelection>
  threadReasoningSelections: Record<string, ReasoningEffort>
}

export interface SubmitPromptOptions {
  attachments?: ComposerAttachment[]
  fromQueue?: boolean
  queue?: boolean
  text?: string
}

const NEW_SESSION_KEY = '__new__'
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_FILE_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'])
const PDF_TYPES = new Set(['application/pdf'])
const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/flac',
  'audio/x-wav'
])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'])

export const composerState = $state<ComposerState>({
  model: {
    error: null,
    fastSwitching: false,
    info: null,
    loading: false,
    options: null,
    reasoningSwitching: false,
    switching: false
  },
  sessions: {},
  threadFastSelections: {},
  threadModelSelections: {},
  threadReasoningSelections: {}
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

function threadKeyForDisplay(displayKey: null | string | undefined): null | string {
  return displayKey ? threadIdForSessionId(displayKey) : null
}

function threadKeyForSession(sessionId: null | string | undefined, targetSessionId?: null | string): null | string {
  const displayKey = displaySessionKey(sessionId) ?? (targetSessionId ? displaySessionIdFor(targetSessionId) : null)
  return threadKeyForDisplay(displayKey)
}

function modelSelectionForSession(sessionId: null | string | undefined): ThreadModelSelection | undefined {
  const threadKey = threadKeyForSession(sessionId)
  return threadKey ? composerState.threadModelSelections[threadKey] : undefined
}

function selectedReasoningForSession(sessionId: null | string | undefined): ReasoningEffort | undefined {
  const threadKey = threadKeyForSession(sessionId)
  return threadKey ? composerState.threadReasoningSelections[threadKey] : undefined
}

function selectedFastModeForSession(sessionId: null | string | undefined): boolean | undefined {
  const threadKey = threadKeyForSession(sessionId)
  return threadKey ? composerState.threadFastSelections[threadKey] : undefined
}

function rememberThreadModelSelection(
  sessionId: null | string | undefined,
  targetSessionId: null | string,
  selection: ThreadModelSelection
): void {
  const threadKey = threadKeyForSession(sessionId, targetSessionId)
  if (!threadKey) return

  composerState.threadModelSelections = {
    ...composerState.threadModelSelections,
    [threadKey]: selection
  }
}

function rememberThreadReasoningSelection(
  sessionId: null | string | undefined,
  targetSessionId: null | string,
  effort: ReasoningEffort
): void {
  const threadKey = threadKeyForSession(sessionId, targetSessionId)
  if (!threadKey) return

  composerState.threadReasoningSelections = {
    ...composerState.threadReasoningSelections,
    [threadKey]: effort
  }
}

function rememberThreadFastSelection(
  sessionId: null | string | undefined,
  targetSessionId: null | string,
  enabled: boolean
): void {
  const threadKey = threadKeyForSession(sessionId, targetSessionId)
  if (!threadKey) return

  composerState.threadFastSelections = {
    ...composerState.threadFastSelections,
    [threadKey]: enabled
  }
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

function cloneAttachments(attachments: ComposerAttachment[]): ComposerAttachment[] {
  return attachments.map(cloneAttachment)
}

function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  const raw = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl

  return raw.replace(/\s+/g, '')
}

function fallbackPromptForAttachments(attachments: ComposerAttachment[]): string {
  if (attachments.length === 0) return ''
  if (attachments.every(attachment => attachment.kind === 'image')) return 'What do you see in this image?'
  if (attachments.every(attachment => attachment.kind === 'pdf')) return 'Please review the attached PDF.'
  return 'Please review the attached files.'
}

function buildPayload(text: string, attachments: ComposerAttachment[]): PromptSubmitPayload {
  const contextRefs = attachments
    .map(attachment => attachment.refText?.trim())
    .filter((ref): ref is string => Boolean(ref))
    .join('\n')

  return [contextRefs, text.trim()].filter(Boolean).join('\n\n') || fallbackPromptForAttachments(attachments)
}

function attachmentRelayFailureMessage(error: unknown, attachment: ComposerAttachment): string {
  return inlineErrorMessage(error, `Could not attach ${attachment.label || attachment.kind}`)
}

async function syncAttachmentsForSubmit(
  sessionId: string,
  profile: string,
  attachments: ComposerAttachment[]
): Promise<void> {
  for (const attachment of attachments) {
    if (attachment.attachedSessionId === sessionId && (attachment.kind === 'image' || attachment.refText)) continue

    let result: AttachmentRelayResponse
    try {
      if (attachment.kind === 'image') {
        const contentBase64 = base64FromDataUrl(attachment.dataUrl)
        if (!contentBase64) {
          throw new Error(`Could not read ${attachment.label || 'attachment'}`)
        }

        result = await requestGateway<AttachmentRelayResponse>('image.attach_bytes', {
          content_base64: contentBase64,
          filename: attachment.label || 'image.png',
          profile,
          session_id: sessionId
        })
      } else {
        result = await requestGateway<AttachmentRelayResponse>('file.attach', {
          data_url: attachment.dataUrl,
          name: attachment.label || 'attachment',
          path: attachment.path || attachment.label || 'attachment',
          profile,
          session_id: sessionId
        })
      }
    } catch (error) {
      throw new Error(attachmentRelayFailureMessage(error, attachment))
    }

    if (!result.attached) {
      throw new Error(attachmentRelayFailureMessage(result.message, attachment))
    }

    attachment.attachedSessionId = sessionId
    if (attachment.kind !== 'image') {
      if (!result.ref_text) {
        throw new Error(attachmentRelayFailureMessage('file.attach did not return a @file reference', attachment))
      }
      attachment.refText = result.ref_text
      attachment.path = result.path ?? attachment.path
    } else if (result.path) {
      attachment.path = result.path
    }
  }
}

function modelSelectionKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`
}

function modelQuote(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value
}

function modelSwitchCommand(selection: ThreadModelSelection): string {
  return `/model ${modelQuote(selection.model)} --provider ${modelQuote(selection.provider)}`
}

function clearComposerPayload(sessionId: null | string | undefined): void {
  clearComposerDraft(sessionId)
  clearComposerAttachments(sessionId)
}

function normalizeReasoningEffort(effort: string): ReasoningEffort {
  if (
    effort === 'high' ||
    effort === 'medium' ||
    effort === 'low' ||
    effort === 'minimal' ||
    effort === 'none' ||
    effort === 'xhigh'
  ) {
    return effort
  }
  return 'medium'
}

function profileSlashArg(command: string): string | undefined {
  const match = /^\/profile(?:\s+(.*))?$/i.exec(command)
  return match ? (match[1] ?? '').trim() : undefined
}

function renderProfileStatus(sessionId: null | string | undefined): string {
  return [`slash:/profile`, `profile: ${targetProfileForSession(sessionId)}`].join('\n')
}

function renderProfileSwitch(command: string, profile: string): string {
  return [`slash:${command}`, `new chat profile: ${profile}`].join('\n')
}

function profileNames(): string {
  return profileState.profiles.map(profile => profile.name).join(', ')
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

function clearComposerDraft(sessionId: null | string | undefined): void {
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

function attachmentKindFor(file: File): ComposerAttachmentKind {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()

  if (type.startsWith('image/') && (IMAGE_TYPES.size === 0 || IMAGE_TYPES.has(type))) return 'image'
  if (PDF_TYPES.has(type) || name.endsWith('.pdf')) return 'pdf'
  if (type.startsWith('audio/') || AUDIO_TYPES.has(type) || /\.(flac|m4a|mp3|ogg|opus|wav)$/i.test(name)) return 'audio'
  if (type.startsWith('video/') || VIDEO_TYPES.has(type) || /\.(avi|mkv|mov|mp4|webm)$/i.test(name)) return 'video'
  return 'file'
}

function maxBytesFor(kind: ComposerAttachmentKind): number {
  return kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
}

function fallbackLabelForKind(kind: ComposerAttachmentKind): string {
  switch (kind) {
    case 'audio':
      return 'audio'
    case 'image':
      return 'image'
    case 'pdf':
      return 'document.pdf'
    case 'video':
      return 'video'
    default:
      return 'attachment'
  }
}

function attachmentDetailFor(file: File, kind: ComposerAttachmentKind): string {
  const size = formatBytes(file.size)
  if (kind === 'pdf') return `PDF · ${size}`
  if (file.type) return `${file.type} · ${size}`
  return size
}

export async function addAttachmentFiles(
  sessionId: null | string | undefined,
  files: FileList | File[]
): Promise<void> {
  const session = ensureComposerSession(sessionId)
  session.error = null

  const candidates = Array.from(files)

  for (const file of candidates) {
    const kind = attachmentKindFor(file)

    const maxBytes = maxBytesFor(kind)
    if (file.size > maxBytes) {
      session.error = `${file.name || fallbackLabelForKind(kind)} is ${formatBytes(file.size)}. The composer accepts ${kind === 'image' ? 'images' : 'files'} up to ${formatBytes(maxBytes)}.`
      continue
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const attachment: ComposerAttachment = {
        dataUrl,
        detail: attachmentDetailFor(file, kind),
        id: nextId(kind),
        kind,
        label: file.name || fallbackLabelForKind(kind),
        mediaType: file.type || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        path: file.name || fallbackLabelForKind(kind),
        previewUrl: kind === 'image' ? dataUrl : undefined,
        size: file.size
      }

      session.attachments = [...session.attachments, attachment]
    } catch (error) {
      session.error = messageForError(error)
    }
  }
}

export function markComposerInterrupted(sessionId: null | string | undefined, interrupted: boolean): void {
  ensureComposerSession(sessionId).userInterrupted = interrupted
}

function queuedSessionKey(sessionId: null | string | undefined): null | string {
  return sessionId?.trim() || null
}

export function currentModelLabel(sessionId: null | string | undefined): string {
  const selection = modelSelectionForSession(sessionId)
  const thread = threadForSession(sessionId)
  const provider =
    selection?.provider ??
    thread?.provider ??
    composerState.model.info?.provider ??
    composerState.model.options?.provider
  const model =
    selection?.model ?? thread?.model ?? composerState.model.info?.model ?? composerState.model.options?.model

  return [provider, model].filter(Boolean).join(' / ') || 'Model unavailable'
}

export function currentReasoningEffortForSession(sessionId: null | string | undefined): ReasoningEffort {
  return (
    selectedReasoningForSession(sessionId) ??
    (threadForSession(sessionId)?.reasoningEffort as ReasoningEffort | undefined) ??
    'medium'
  )
}

export function currentFastModeForSession(sessionId: null | string | undefined): boolean {
  const selected = selectedFastModeForSession(sessionId)
  return selected ?? Boolean(threadForSession(sessionId)?.fast)
}

export function groupedModelOptions(sessionId?: null | string): ComposerModelGroup[] {
  const selection = modelSelectionForSession(sessionId)
  const currentProvider =
    selection?.provider ?? composerState.model.options?.provider ?? composerState.model.info?.provider ?? ''
  const currentModel = selection?.model ?? composerState.model.options?.model ?? composerState.model.info?.model ?? ''
  const providers = composerState.model.options?.providers ?? []

  return providers
    .map((provider: ModelOptionProvider): ComposerModelGroup => {
      const providerKey = provider.slug || provider.name
      const unavailable = new Set(provider.unavailable_models ?? [])

      return {
        freeTier: provider.free_tier,
        name: provider.name || providerKey,
        provider: providerKey,
        warning: provider.warning,
        options: (provider.models ?? []).map(model => ({
          capabilities: provider.capabilities?.[model],
          current: providerKey === currentProvider && model === currentModel,
          key: modelSelectionKey(providerKey, model),
          model,
          pricing: provider.pricing?.[model],
          provider: providerKey,
          unavailable: unavailable.has(model)
        }))
      }
    })
    .filter(group => group.options.length > 0)
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
      composerState.model.error = messageForError(rejection)
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
    session.commandError = messageForError(error)
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

async function executeProfileCommand(
  sessionId: null | string | undefined,
  command: string,
  arg: string,
  composer: ComposerSessionState
): Promise<boolean> {
  let targetSessionId = liveSessionKey(sessionId)

  if (!arg) {
    if (!targetSessionId) {
      targetSessionId = await createSession()
    }

    if (!targetSessionId) {
      composer.error = 'Could not create a session for the profile command.'
      return false
    }

    appendSystemMessage(targetSessionId, renderProfileStatus(sessionId))
    clearComposerDraft(sessionId)
    clearComposerAttachments(sessionId)
    commitActiveSessionRoute()
    return true
  }

  try {
    const target = normalizeProfileKey(arg)
    const { profiles } = await getProfiles()
    profileState.profiles = profiles
    const match = profiles.find(profile => normalizeProfileKey(profile.name) === target)

    if (!match) {
      const available = profileNames()
      composer.error = available
        ? `No profile named "${arg}". Available profiles: ${available}`
        : `No profile named "${arg}".`
      return false
    }

    const profile = normalizeProfileKey(match.name)
    profileState.newChatProfile = profile
    await ensureGatewayProfile(profile)

    if (targetSessionId) {
      appendSystemMessage(targetSessionId, renderProfileSwitch(command, profile))
    }

    clearComposerDraft(sessionId)
    clearComposerAttachments(sessionId)
    return true
  } catch (error) {
    composer.error = inlineErrorMessage(error, 'Profile command failed')
    return false
  }
}

async function executeReloadMcpCommand(
  sessionId: null | string | undefined,
  command: string,
  composer: ComposerSessionState
): Promise<boolean> {
  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession()
  }

  if (!targetSessionId) {
    composer.error = 'Could not create a session for the MCP reload command.'
    return false
  }

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    await requestGateway('reload.mcp', {
      confirm: true,
      profile,
      session_id: targetSessionId
    })
    appendSystemMessage(targetSessionId, renderSlashOutput(command, { output: 'MCP servers reloaded.' }))
    clearComposerDraft(sessionId)
    clearComposerAttachments(sessionId)
    commitActiveSessionRoute()
    void loadSessions().catch(() => undefined)

    return true
  } catch (error) {
    const message = inlineErrorMessage(error, 'MCP reload failed')
    composer.error = message
    appendAssistantErrorMessage(targetSessionId, message)

    return false
  }
}

export async function executeSlashCommand(sessionId: null | string | undefined, rawCommand: string): Promise<boolean> {
  const command = rawCommand.trim()
  const parsed = parseSlashCommand(command)
  const displayKey = displaySessionKey(sessionId) ?? sessionId
  const composer = ensureComposerSession(displayKey)
  const targetComposerKey = displayKey ?? sessionId

  if (!command.startsWith('/') || !parsed.name) return false

  composer.submitting = true
  composer.error = null
  clearComposerPayload(targetComposerKey)

  try {
    const normalizedName = parsed.name.toLowerCase()

    if (normalizedName === 'new' || normalizedName === 'reset') {
      startNewSession()
      return true
    }

    const profileArg = profileSlashArg(command)
    if (profileArg !== undefined) {
      return executeProfileCommand(sessionId, command, profileArg, composer)
    }

    if (isReloadMcpCommand(command)) {
      return executeReloadMcpCommand(sessionId, command, composer)
    }

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
        command: slashExecCommand(command),
        session_id: targetSessionId,
        profile
      })
      appendSystemMessage(targetSessionId, renderSlashOutput(command, result))
      commitActiveSessionRoute()
      void loadSessions().catch(() => undefined)

      return true
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        const message = commandNotFoundMessage(parsed.name)
        composer.error = message
        appendAssistantErrorMessage(targetSessionId, message)
        return false
      }

      try {
        const handled = await executeCommandDispatch({
          arg: parsed.arg,
          command,
          composer,
          name: parsed.name,
          profile: targetProfileForSession(sessionId),
          sessionId,
          targetSessionId
        })

        if (handled || composer.error) return handled
      } catch (dispatchError) {
        const message = isCommandNotFoundError(dispatchError)
          ? commandNotFoundMessage(parsed.name)
          : inlineErrorMessage(dispatchError, 'Command dispatch failed')
        composer.error = message
        appendAssistantErrorMessage(targetSessionId, message)

        return false
      }

      const message = inlineErrorMessage(error, 'Slash command failed')
      composer.error = message
      appendAssistantErrorMessage(targetSessionId, message)

      return false
    }
  } finally {
    composer.submitting = false
  }
}

async function executeCommandDispatch(options: {
  arg: string
  command: string
  composer: ComposerSessionState
  name: string
  profile: string
  sessionId: null | string | undefined
  targetSessionId: string
}): Promise<boolean> {
  const dispatch = parseCommandDispatch(
    await requestGateway<unknown>('command.dispatch', {
      name: options.name,
      arg: options.arg,
      session_id: options.targetSessionId,
      profile: options.profile
    })
  )

  if (!dispatch) {
    const message = 'error: invalid response: command.dispatch'
    options.composer.error = message
    appendSystemMessage(options.targetSessionId, renderSlashOutput(options.command, { output: message }))
    return false
  }

  switch (dispatch.type) {
    case 'exec':
    case 'plugin':
      appendSystemMessage(options.targetSessionId, renderSlashOutput(options.command, { output: dispatch.output }))
      clearComposerDraft(options.sessionId)
      clearComposerAttachments(options.sessionId)
      commitActiveSessionRoute()
      void loadSessions().catch(() => undefined)
      return true

    case 'alias':
      return executeSlashCommand(
        options.sessionId,
        `/${dispatch.target.replace(/^\/+/, '')}${options.arg ? ` ${options.arg}` : ''}`
      )

    case 'skill': {
      const message = dispatch.message?.trim() ?? ''

      if (!message) {
        const error = `/${options.name}: skill payload missing message`
        options.composer.error = error
        appendSystemMessage(options.targetSessionId, renderSlashOutput(options.command, { output: error }))
        return false
      }

      appendSystemMessage(
        options.targetSessionId,
        renderSlashOutput(options.command, { output: `loading skill: ${dispatch.name}` })
      )
      return submitPrompt(options.sessionId, { queue: false, text: message })
    }

    case 'send': {
      const message = dispatch.message.trim()

      if (!message) {
        const error = `/${options.name}: empty message`
        options.composer.error = error
        appendSystemMessage(options.targetSessionId, renderSlashOutput(options.command, { output: error }))
        return false
      }

      if (dispatch.notice?.trim()) {
        appendSystemMessage(options.targetSessionId, renderSlashOutput(options.command, { output: dispatch.notice }))
      }

      return submitPrompt(options.sessionId, { queue: false, text: message })
    }
  }
}

async function applyRememberedModelSelection(
  sessionId: null | string | undefined,
  targetSessionId: string,
  profile: string
): Promise<void> {
  const selection = modelSelectionForSession(sessionId)
  if (!selection) return

  const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
  const thread = threadForSession(displayKey)

  if (thread?.model === selection.model && thread.provider === selection.provider) return

  await requestGateway<SlashExecResponse>('slash.exec', {
    command: modelSwitchCommand(selection),
    session_id: targetSessionId,
    profile
  })
}

async function applyRememberedReasoningSelection(
  sessionId: null | string | undefined,
  targetSessionId: string,
  profile: string
): Promise<void> {
  const effort = selectedReasoningForSession(sessionId)
  if (effort === undefined) return

  const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
  const thread = threadForSession(displayKey)

  if (thread?.reasoningEffort === effort) return

  const command = `/reasoning ${effort === 'none' ? 'off' : effort}`
  await requestGateway<SlashExecResponse>('slash.exec', {
    command,
    session_id: targetSessionId,
    profile
  })
}

async function applyRememberedFastSelection(
  sessionId: null | string | undefined,
  targetSessionId: string,
  profile: string
): Promise<void> {
  const enabled = selectedFastModeForSession(sessionId)
  if (enabled === undefined) return

  const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
  const thread = threadForSession(displayKey)

  if (thread?.fast === enabled) return

  await requestGateway<SlashExecResponse>('slash.exec', {
    command: `/fast ${enabled ? 'on' : 'off'}`,
    session_id: targetSessionId,
    profile
  })
}

async function applyRememberedRuntimeSelections(
  sessionId: null | string | undefined,
  targetSessionId: string,
  profile: string
): Promise<void> {
  await applyRememberedModelSelection(sessionId, targetSessionId, profile)
  await applyRememberedReasoningSelection(sessionId, targetSessionId, profile)
  await applyRememberedFastSelection(sessionId, targetSessionId, profile)
}

export async function selectComposerReasoningEffort(
  sessionId: null | string | undefined,
  effort: ReasoningEffort
): Promise<boolean> {
  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession()
  }

  if (!targetSessionId) {
    composerState.model.error = 'Could not create a session before changing reasoning effort.'
    return false
  }

  composerState.model.reasoningSwitching = true
  composerState.model.error = null

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    const normalized = normalizeReasoningEffort(effort)
    const reasonArg = normalized === 'none' ? 'off' : normalized
    const command = `/reasoning ${reasonArg}`
    const result = await requestGateway<SlashExecResponse>('slash.exec', {
      command,
      session_id: targetSessionId,
      profile
    })

    appendSystemMessage(targetSessionId, renderSlashOutput(command, result))

    const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
    rememberThreadReasoningSelection(displayKey, targetSessionId, normalized)
    const thread = threadForSession(displayKey)
    if (thread) {
      thread.reasoningEffort = normalized
    }
    commitActiveSessionRoute()
    void loadSessions().catch(() => undefined)

    return true
  } catch (error) {
    composerState.model.error = inlineErrorMessage(error, 'Reasoning switch failed')
    return false
  } finally {
    composerState.model.reasoningSwitching = false
  }
}

export async function selectComposerFastMode(sessionId: null | string | undefined, enabled: boolean): Promise<boolean> {
  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession()
  }

  if (!targetSessionId) {
    composerState.model.error = 'Could not create a session before changing fast mode.'
    return false
  }

  composerState.model.fastSwitching = true
  composerState.model.error = null

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    const command = `/fast ${enabled ? 'on' : 'off'}`
    const result = await requestGateway<SlashExecResponse>('slash.exec', {
      command,
      session_id: targetSessionId,
      profile
    })

    appendSystemMessage(targetSessionId, renderSlashOutput(command, result))

    const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
    rememberThreadFastSelection(displayKey, targetSessionId, enabled)
    const thread = threadForSession(displayKey)
    if (thread) {
      thread.fast = enabled
    }
    commitActiveSessionRoute()
    void loadSessions().catch(() => undefined)

    return true
  } catch (error) {
    composerState.model.error = inlineErrorMessage(error, 'Fast mode switch failed')
    return false
  } finally {
    composerState.model.fastSwitching = false
  }
}

export async function selectComposerModel(sessionId: null | string | undefined, key: string): Promise<boolean> {
  const [provider, model] = key.split('\u0000')

  if (!provider || !model) {
    composerState.model.error = 'Choose a model before switching.'
    return false
  }

  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession()
  }

  if (!targetSessionId) {
    composerState.model.error = 'Could not create a session before switching models.'
    return false
  }

  composerState.model.switching = true
  composerState.model.error = null

  try {
    const profile = targetProfileForSession(sessionId)
    await ensureGatewayProfile(profile)
    const selection = { model, provider }
    const command = modelSwitchCommand(selection)
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
    rememberThreadModelSelection(sessionId, targetSessionId, selection)
    appendSystemMessage(targetSessionId, renderSlashOutput(command, result))
    const displayKey = displaySessionKey(sessionId) ?? displaySessionIdFor(targetSessionId)
    const thread = threadForSession(displayKey)
    if (thread) {
      thread.model = model
      thread.provider = provider
    }
    commitActiveSessionRoute()
    void loadSessions().catch(() => undefined)

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
  const allowQueue = options.queue ?? true

  if (!hasPayload) return false

  const activeThread = threadForSession(sessionId)

  if (allowQueue && !options.fromQueue && sessionId && activeThread?.busy) {
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

  const displayText = compactWhitespace(visibleText) || fallbackPromptForAttachments(attachments)
  let targetSessionId = liveSessionKey(sessionId)

  if (!targetSessionId) {
    targetSessionId = await createSession(displayText)
  }

  if (!targetSessionId) {
    composer.submitting = false
    composer.error = 'Could not create a session.'
    return false
  }

  const targetProfile = targetProfileForSession(sessionId)

  appendUserMessage(targetSessionId, displayText, attachments)
  setThreadBusy(targetSessionId, true)
  commitActiveSessionRoute()

  if (!options.fromQueue) {
    clearComposerDraft(sessionId)
    clearComposerAttachments(sessionId)
  }

  try {
    await ensureGatewayProfile(targetProfile)
    await applyRememberedRuntimeSelections(sessionId, targetSessionId, targetProfile)
  } catch (error) {
    const message = inlineErrorMessage(error, 'Could not prepare session runtime')
    setThreadBusy(targetSessionId, false)
    appendAssistantErrorMessage(targetSessionId, message)
    composer.error = message
    composer.submitting = false
    return false
  }

  try {
    await syncAttachmentsForSubmit(targetSessionId, targetProfile, attachments)
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

      if (allowQueue) {
        const queueKey = sessionId ?? displayKey
        enqueueQueuedPrompt(queueKey, { attachments, text: visibleText })
        composer.error = null

        return true
      }

      composer.error = inlineErrorMessage(error, 'Session busy')
      return false
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
