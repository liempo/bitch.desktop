import {
  listAllProfileSessions,
  listSessions as apiListSessions,
  searchSessions as apiSearchSessions,
  renameSession as apiRenameSession,
  setSessionArchived as apiSetSessionArchived,
  deleteSession as apiDeleteSession
} from '$lib/api/dashboard'
import { messageForError } from '$lib/errors'
import { gatewayState, requestGateway } from '$lib/stores/gateway.svelte'
import {
  ALL_PROFILES,
  ensureGatewayProfile,
  getProfileScope,
  profileState,
  normalizeProfileKey
} from '$lib/hermes/profiles'
import {
  isPinned as isStoredPin,
  layoutState,
  pinSession as storePin,
  unpinSession as storeUnpin
} from '$lib/stores/layout.svelte'
import type {
  PaginatedSessions,
  SessionCreateResponse,
  SessionInfo,
  SessionResumeResponse,
  SessionSearchResult
} from '$lib/types/hermes'
import { navigate, routerState, sessionRoute } from '@/app/agent/router.svelte'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 40
const COLS = 96
const SEARCH_DEBOUNCE_MS = 300

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SessionState {
  /** Short live session ID (8-char hex sid) used for all live RPCs
   *  (prompt.submit, slash.exec, commands.catalog, etc.).  The gateway
   *  stores sessions in an in-memory dict keyed by this ID. */
  activeSessionId: string | null
  /** Persistent stored session key used for session.resume and the
   *  URL hash.  Survives page refresh because the DB indexes by it. */
  storedSessionId: string | null
  /** Runtime sid by stored key, matching upstream Desktop's
   *  runtimeIdByStoredSessionIdRef. Used to route background live events
   *  and to reselect a live session without needless re-resume. */
  runtimeIdsByStoredSessionId: Record<string, string>
  /** Stored key by runtime sid. Reverse index for stream event routing. */
  storedSessionIdsByRuntimeId: Record<string, string>
  archivedError: string | null
  archivedSessionProfileTotals: Record<string, number>
  archivedSessions: SessionInfo[]
  archivedSessionsInitialized: boolean
  archivedSessionsLoading: boolean
  archivedSessionsLoadingMore: boolean
  archivedSessionsOffset: number
  archivedSessionsTotal: number
  error: string | null
  mutatingSessionIds: string[]
  needsInputSessionIds: string[]
  resumeExhaustedSessionId: string | null
  resumeFailedSessionId: string | null
  resumingSessionId: string | null
  searchError: string | null
  searchQuery: string
  searchResults: SessionSearchResult[]
  searching: boolean
  sessions: SessionInfo[]
  sessionsInitialized: boolean
  sessionsLoading: boolean
  sessionsLoadingMore: boolean
  sessionsOffset: number
  sessionsTotal: number
  sessionProfileTotals: Record<string, number>
  sessionProfilesById: Record<string, string>
  /** Ordered stored-session ids that belong to a compression/renewal lineage,
   *  keyed by the durable thread/root id. Used to hydrate the visible thread
   *  from every remote stored segment instead of only the latest compression tip. */
  sessionLineageIdsByThreadId: Record<string, string[]>
  sessionStartedAtById: Record<string, number>
  sessionThreadIdsById: Record<string, string>
  workingSessionIds: string[]
}

/* ------------------------------------------------------------------ */
/*  Reactive state                                                     */
/* ------------------------------------------------------------------ */

export const sessionState = $state<SessionState>({
  activeSessionId: null,
  storedSessionId: null,
  runtimeIdsByStoredSessionId: {},
  storedSessionIdsByRuntimeId: {},
  archivedError: null,
  archivedSessionProfileTotals: {},
  archivedSessions: [],
  archivedSessionsInitialized: false,
  archivedSessionsLoading: false,
  archivedSessionsLoadingMore: false,
  archivedSessionsOffset: 0,
  archivedSessionsTotal: 0,
  error: null,
  mutatingSessionIds: [],
  needsInputSessionIds: [],
  resumeExhaustedSessionId: null,
  resumeFailedSessionId: null,
  resumingSessionId: null,
  searchError: null,
  searchQuery: '',
  searchResults: [],
  searching: false,
  sessions: [],
  sessionsInitialized: false,
  sessionsLoading: false,
  sessionsLoadingMore: false,
  sessionsOffset: 0,
  sessionsTotal: 0,
  sessionProfileTotals: {},
  sessionProfilesById: {},
  sessionLineageIdsByThreadId: {},
  sessionStartedAtById: {},
  sessionThreadIdsById: {},
  workingSessionIds: []
})

let searchTimeout: ReturnType<typeof setTimeout> | null = null
let searchRevision = 0
let resumeRequestId = 0
const SESSION_SETTLE_GRACE_MS = 30 * 1000
const SESSION_WATCHDOG_TIMEOUT_MS = 8 * 60 * 1000
const settledSessionExpiry = new Map<string, number>()
const sessionWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultProfileForCurrentScope(): string {
  return getProfileScope() === ALL_PROFILES ? 'default' : normalizeProfileKey(getProfileScope())
}

function sessionWithProfile(session: SessionInfo, fallbackProfile = defaultProfileForCurrentScope()): SessionInfo {
  const profile = normalizeProfileKey(session.profile ?? (session.is_default_profile ? 'default' : fallbackProfile))
  return { ...session, profile, is_default_profile: session.is_default_profile ?? profile === 'default' }
}

export function sessionThreadId(session: Pick<SessionInfo, '_lineage_root_id' | 'id' | 'lineage_root'>): string {
  return session._lineage_root_id?.trim() || session.lineage_root?.trim() || session.id
}

export function threadIdForSessionId(sessionId: string | null | undefined): string | null {
  const id = sessionId?.trim()
  if (!id) return null

  const displayId = displaySessionIdFor(id)
  return sessionState.sessionThreadIdsById[displayId] ?? displayId
}

export function lineageMessageSessionIds(sessionId: string | null | undefined): string[] {
  const id = sessionId?.trim()
  if (!id) return []

  const threadId = threadIdForSessionId(id) ?? id
  const lineageIds = sessionState.sessionLineageIdsByThreadId[threadId]
  const orderedIds = lineageIds?.length ? lineageIds : [threadId]
  const result = orderedIds.filter(Boolean)

  if (!result.includes(id)) {
    result.push(id)
  }

  return [...new Set(result)]
}

function recordSessionProfiles(sessions: SessionInfo[]): void {
  const nextProfiles = { ...sessionState.sessionProfilesById }
  const nextLineages = { ...sessionState.sessionLineageIdsByThreadId }
  const nextStartedAt = { ...sessionState.sessionStartedAtById }
  const nextThreads = { ...sessionState.sessionThreadIdsById }
  const touchedThreadIds = new Set<string>()

  for (const session of sessions) {
    const profile = normalizeProfileKey(session.profile)
    const threadId = sessionThreadId(session)
    const lineageIds = new Set(nextLineages[threadId] ?? [])

    lineageIds.add(threadId)
    lineageIds.add(session.id)
    nextLineages[threadId] = [...lineageIds]
    nextProfiles[session.id] = profile
    nextProfiles[threadId] ??= profile
    nextStartedAt[session.id] = session.started_at
    nextThreads[session.id] = threadId
    nextThreads[threadId] = threadId
    touchedThreadIds.add(threadId)
  }

  for (const threadId of touchedThreadIds) {
    const originalOrder = new Map((nextLineages[threadId] ?? []).map((id, index) => [id, index]))
    const ordered = [...new Set(nextLineages[threadId] ?? [threadId])]

    ordered.sort((left, right) => {
      if (left === threadId && right !== threadId) return -1
      if (right === threadId && left !== threadId) return 1

      const leftStarted = nextStartedAt[left]
      const rightStarted = nextStartedAt[right]

      if (leftStarted != null && rightStarted != null && leftStarted !== rightStarted) {
        return leftStarted - rightStarted
      }

      if (leftStarted != null && rightStarted == null) return -1
      if (rightStarted != null && leftStarted == null) return 1

      return (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0)
    })

    nextLineages[threadId] = ordered
  }

  sessionState.sessionProfilesById = nextProfiles
  sessionState.sessionLineageIdsByThreadId = nextLineages
  sessionState.sessionStartedAtById = nextStartedAt
  sessionState.sessionThreadIdsById = nextThreads
}

export function profileForSession(sessionId: string | null | undefined): string | null {
  const id = sessionId?.trim()
  if (!id) return null

  const listed = sessionState.sessions.find(session => session.id === id)?.profile
  const cached = listed ?? sessionState.sessionProfilesById[id]

  if (cached) {
    return normalizeProfileKey(cached)
  }

  return getProfileScope() === ALL_PROFILES ? null : normalizeProfileKey(getProfileScope())
}

function profileForMutation(sessionId: string): string | null {
  return profileForSession(sessionId)
}

function updateSession(sessionId: string, patch: Partial<SessionInfo>): void {
  const session = sessionState.sessions.find(item => item.id === sessionId)

  if (session) {
    Object.assign(session, patch)
  }
}

function removeSessionFromLocalState(sessionId: string): void {
  const threadId = threadIdForSessionId(sessionId) ?? sessionId
  const before = sessionState.sessions.length
  const profile = profileForSession(sessionId) ?? profileForSession(threadId)

  sessionState.sessions = sessionState.sessions.filter(session => sessionThreadId(session) !== threadId)

  for (const [id, mappedThreadId] of Object.entries(sessionState.sessionThreadIdsById)) {
    if (id === sessionId || id === threadId || mappedThreadId === threadId) {
      delete sessionState.sessionThreadIdsById[id]
      delete sessionState.sessionProfilesById[id]
      delete sessionState.sessionStartedAtById[id]
    }
  }

  delete sessionState.sessionLineageIdsByThreadId[threadId]
  delete sessionState.sessionProfilesById[sessionId]
  delete sessionState.sessionProfilesById[threadId]
  delete sessionState.sessionStartedAtById[sessionId]
  delete sessionState.sessionStartedAtById[threadId]
  delete sessionState.sessionThreadIdsById[sessionId]
  delete sessionState.sessionThreadIdsById[threadId]

  if (sessionState.sessions.length !== before && sessionState.sessionsTotal > 0) {
    sessionState.sessionsTotal -= 1
    if (
      profile &&
      sessionState.sessionProfileTotals[profile] != null &&
      sessionState.sessionProfileTotals[profile] > 0
    ) {
      sessionState.sessionProfileTotals = {
        ...sessionState.sessionProfileTotals,
        [profile]: sessionState.sessionProfileTotals[profile] - 1
      }
    }
  }
}

function clearSessionPins(sessionId: string): void {
  const threadId = threadIdForSessionId(sessionId) ?? sessionId
  storeUnpin(sessionId)
  storeUnpin(threadId)
}

function sessionGroupKey(session: SessionInfo): string {
  return `${normalizeProfileKey(session.profile)}\u0000${sessionThreadId(session)}`
}

function recentValue(session: SessionInfo): number {
  return session.last_active ?? session.ended_at ?? session.started_at ?? 0
}

function newestSession(sessions: SessionInfo[]): SessionInfo {
  return sessions.reduce((newest, session) => (recentValue(session) > recentValue(newest) ? session : newest))
}

function oldestSession(sessions: SessionInfo[]): SessionInfo {
  return sessions.reduce((oldest, session) => (session.started_at < oldest.started_at ? session : oldest))
}

function threadTitle(title: null | string | undefined, stripLineageSuffix: boolean): null | string {
  const trimmed = title?.trim()
  if (!trimmed) return null

  return stripLineageSuffix ? trimmed.replace(/\s+#\d+$/, '') : trimmed
}

function shouldStripLineageTitleSuffix(session: SessionInfo, sessions: SessionInfo[]): boolean {
  return sessions.length > 1 || sessionThreadId(session) !== session.id
}

function collapseSessionGroup(threadId: string, sessions: SessionInfo[]): SessionInfo | null {
  const latest = newestSession(sessions)
  if (latest.archived) return null

  const visible = sessions.filter(session => !session.archived)
  const root = sessions.find(session => session.id === threadId) ?? oldestSession(sessions)
  const inputTokens = sessions.reduce((total, session) => total + (session.input_tokens ?? 0), 0)
  const outputTokens = sessions.reduce((total, session) => total + (session.output_tokens ?? 0), 0)
  const messageCount = sessions.reduce((total, session) => total + (session.message_count ?? 0), 0)
  const toolCallCount = sessions.reduce((total, session) => total + (session.tool_call_count ?? 0), 0)
  const lastActive = Math.max(...sessions.map(recentValue))
  const startedAt = Math.min(...sessions.map(session => session.started_at))
  const stripLineageSuffix = shouldStripLineageTitleSuffix(latest, sessions)
  const title = threadTitle(latest.title, stripLineageSuffix) ?? threadTitle(root.title, stripLineageSuffix)

  return {
    ...latest,
    _lineage_root_id: latest.id === threadId ? (latest._lineage_root_id ?? null) : threadId,
    archived: false,
    input_tokens: inputTokens,
    is_active: visible.some(session => session.is_active),
    last_active: lastActive,
    message_count: messageCount,
    output_tokens: outputTokens,
    started_at: startedAt,
    title,
    tool_call_count: toolCallCount
  }
}

export function collapseSessionsToThreads(sessions: SessionInfo[]): SessionInfo[] {
  const groups = new Map<string, { sessions: SessionInfo[]; threadId: string }>()

  for (const session of sessions) {
    const key = sessionGroupKey(session)
    const existing = groups.get(key)

    if (existing) {
      existing.sessions.push(session)
    } else {
      groups.set(key, { sessions: [session], threadId: sessionThreadId(session) })
    }
  }

  return [...groups.values()]
    .map(group => collapseSessionGroup(group.threadId, group.sessions))
    .filter((session): session is SessionInfo => Boolean(session))
    .sort((left, right) => recentValue(right) - recentValue(left))
}

function collapseArchivedSessionGroup(threadId: string, sessions: SessionInfo[]): SessionInfo {
  const latest = newestSession(sessions)
  const root = sessions.find(session => session.id === threadId) ?? oldestSession(sessions)
  const inputTokens = sessions.reduce((total, session) => total + (session.input_tokens ?? 0), 0)
  const outputTokens = sessions.reduce((total, session) => total + (session.output_tokens ?? 0), 0)
  const messageCount = sessions.reduce((total, session) => total + (session.message_count ?? 0), 0)
  const toolCallCount = sessions.reduce((total, session) => total + (session.tool_call_count ?? 0), 0)
  const lastActive = Math.max(...sessions.map(recentValue))
  const startedAt = Math.min(...sessions.map(session => session.started_at))
  const stripLineageSuffix = shouldStripLineageTitleSuffix(latest, sessions)
  const title = threadTitle(latest.title, stripLineageSuffix) ?? threadTitle(root.title, stripLineageSuffix)

  return {
    ...latest,
    _lineage_root_id: latest.id === threadId ? (latest._lineage_root_id ?? null) : threadId,
    archived: true,
    input_tokens: inputTokens,
    is_active: sessions.some(session => session.is_active),
    last_active: lastActive,
    message_count: messageCount,
    output_tokens: outputTokens,
    started_at: startedAt,
    title,
    tool_call_count: toolCallCount
  }
}

export function collapseArchivedSessionsToThreads(sessions: SessionInfo[]): SessionInfo[] {
  const groups = new Map<string, { sessions: SessionInfo[]; threadId: string }>()

  for (const session of sessions) {
    const key = sessionGroupKey(session)
    const existing = groups.get(key)

    if (existing) {
      existing.sessions.push(session)
    } else {
      groups.set(key, { sessions: [session], threadId: sessionThreadId(session) })
    }
  }

  return [...groups.values()]
    .map(group => collapseArchivedSessionGroup(group.threadId, group.sessions))
    .sort((left, right) => recentValue(right) - recentValue(left))
}

function sessionKeepIds(): Set<string> {
  return new Set(
    [
      ...layoutState.pinnedSessionIds,
      ...sessionState.workingSessionIds,
      ...getRecentlySettledSessionIds(),
      sessionState.storedSessionId
    ].filter((id): id is string => Boolean(id))
  )
}

function shouldKeepExistingSession(
  session: SessionInfo,
  keepIds: Set<string>,
  incomingIds: Set<string>,
  incomingGroupKeys: Set<string>
): boolean {
  const threadId = sessionThreadId(session)

  return (
    !incomingIds.has(session.id) &&
    !incomingGroupKeys.has(sessionGroupKey(session)) &&
    (keepIds.has(session.id) || keepIds.has(threadId))
  )
}

function mergeSessions(incoming: SessionInfo[], offset: number): SessionInfo[] {
  if (offset !== 0) {
    const merged = new Map<string, SessionInfo>()

    for (const session of [...sessionState.sessions, ...incoming]) {
      if (!merged.has(session.id)) {
        merged.set(session.id, session)
      }
    }

    return collapseSessionsToThreads([...merged.values()])
  }

  const keepIds = sessionKeepIds()
  const incomingIds = new Set(incoming.map(session => session.id))
  const incomingGroupKeys = new Set(incoming.map(sessionGroupKey))
  const survivors = sessionState.sessions.filter(session =>
    shouldKeepExistingSession(session, keepIds, incomingIds, incomingGroupKeys)
  )

  return collapseSessionsToThreads([...incoming, ...survivors])
}

function upsertOptimisticSession(
  response: SessionCreateResponse,
  storedKey: string,
  profile: string,
  preview: null | string
): void {
  const now = Date.now() / 1000
  const session = sessionWithProfile(
    {
      archived: false,
      cwd: response.info?.cwd ?? null,
      ended_at: null,
      id: storedKey,
      input_tokens: 0,
      is_active: true,
      last_active: now,
      message_count: response.message_count ?? response.messages?.length ?? 0,
      model: response.info?.model ?? null,
      output_tokens: 0,
      preview: preview?.trim() || null,
      profile,
      source: 'tui',
      started_at: now,
      title: null,
      tool_call_count: 0
    },
    profile
  )
  const threadId = sessionThreadId(session)

  recordSessionProfiles([session])
  sessionState.sessions = collapseSessionsToThreads([
    session,
    ...sessionState.sessions.filter(existing => existing.id !== session.id && sessionThreadId(existing) !== threadId)
  ])
  sessionState.sessionsTotal = Math.max(sessionState.sessionsTotal, sessionState.sessions.length)
}

function mergeArchivedSessions(incoming: SessionInfo[], offset: number): SessionInfo[] {
  const merged = new Map<string, SessionInfo>()

  for (const session of [...incoming, ...(offset === 0 ? [] : sessionState.archivedSessions)]) {
    if (!merged.has(session.id)) {
      merged.set(session.id, session)
    }
  }

  return collapseArchivedSessionsToThreads([...merged.values()])
}

function removeArchivedSessionFromLocalState(sessionId: string): void {
  const threadId = threadIdForSessionId(sessionId) ?? sessionId
  const before = sessionState.archivedSessions.length
  const profile = profileForSession(sessionId) ?? profileForSession(threadId)

  sessionState.archivedSessions = sessionState.archivedSessions.filter(session => sessionThreadId(session) !== threadId)

  if (sessionState.archivedSessions.length !== before && sessionState.archivedSessionsTotal > 0) {
    sessionState.archivedSessionsTotal -= 1
    if (
      profile &&
      sessionState.archivedSessionProfileTotals[profile] != null &&
      sessionState.archivedSessionProfileTotals[profile] > 0
    ) {
      sessionState.archivedSessionProfileTotals = {
        ...sessionState.archivedSessionProfileTotals,
        [profile]: sessionState.archivedSessionProfileTotals[profile] - 1
      }
    }
  }
}

function setSessionFlag(list: string[], sessionId: string, enabled: boolean): void {
  const index = list.indexOf(sessionId)

  if (enabled && index === -1) {
    list.push(sessionId)
  } else if (!enabled && index !== -1) {
    list.splice(index, 1)
  }
}

function armSessionWatchdog(sessionId: string): void {
  clearSessionWatchdog(sessionId)
  sessionWatchdogTimers.set(
    sessionId,
    setTimeout(() => {
      sessionWatchdogTimers.delete(sessionId)

      if (sessionState.workingSessionIds.includes(sessionId)) {
        setSessionFlag(sessionState.workingSessionIds, sessionId, false)
      }
    }, SESSION_WATCHDOG_TIMEOUT_MS)
  )
}

function clearSessionWatchdog(sessionId: string): void {
  const timer = sessionWatchdogTimers.get(sessionId)

  if (timer) {
    clearTimeout(timer)
    sessionWatchdogTimers.delete(sessionId)
  }
}

function markSessionSettled(sessionId: string): void {
  settledSessionExpiry.set(sessionId, Date.now() + SESSION_SETTLE_GRACE_MS)
}

function clearSessionSettled(sessionId: string): void {
  settledSessionExpiry.delete(sessionId)
}

export function getRecentlySettledSessionIds(now = Date.now()): string[] {
  const live: string[] = []

  for (const [sessionId, expiry] of settledSessionExpiry.entries()) {
    if (expiry > now) {
      live.push(sessionId)
    } else {
      settledSessionExpiry.delete(sessionId)
    }
  }

  return live
}

export function noteSessionActivity(sessionId: string | null | undefined): void {
  if (!sessionId || !sessionState.workingSessionIds.includes(sessionId)) return
  armSessionWatchdog(sessionId)
}

function currentRouteToken(): string {
  return [
    routerState.route ?? 'unknown',
    routerState.sessionId ?? '',
    sessionState.storedSessionId ?? '',
    sessionState.activeSessionId ?? ''
  ].join(':')
}

export function rememberRuntimeSession(
  storedSessionId: string | null | undefined,
  runtimeSessionId: string | null | undefined
): void {
  const stored = storedSessionId?.trim()
  const runtime = runtimeSessionId?.trim()

  if (!stored || !runtime) return

  const previousRuntime = sessionState.runtimeIdsByStoredSessionId[stored]
  if (previousRuntime && previousRuntime !== runtime) {
    delete sessionState.storedSessionIdsByRuntimeId[previousRuntime]
  }

  const previousStored = sessionState.storedSessionIdsByRuntimeId[runtime]
  if (previousStored && previousStored !== stored) {
    delete sessionState.runtimeIdsByStoredSessionId[previousStored]
  }

  sessionState.runtimeIdsByStoredSessionId[stored] = runtime
  sessionState.storedSessionIdsByRuntimeId[runtime] = stored
}

function forgetRuntimeSession(storedSessionId: string | null | undefined): void {
  const stored = storedSessionId?.trim()
  if (!stored) return

  const runtime = sessionState.runtimeIdsByStoredSessionId[stored]
  if (runtime) {
    delete sessionState.storedSessionIdsByRuntimeId[runtime]
  }
  delete sessionState.runtimeIdsByStoredSessionId[stored]
}

export function runtimeSessionIdForStored(storedSessionId: string | null | undefined): string | null {
  const stored = storedSessionId?.trim()
  return stored ? (sessionState.runtimeIdsByStoredSessionId[stored] ?? null) : null
}

export function storedSessionIdForRuntime(runtimeSessionId: string | null | undefined): string | null {
  const runtime = runtimeSessionId?.trim()
  return runtime ? (sessionState.storedSessionIdsByRuntimeId[runtime] ?? null) : null
}

export function displaySessionIdFor(sessionId: string): string {
  return (
    storedSessionIdForRuntime(sessionId) ??
    (sessionId === sessionState.activeSessionId && sessionState.storedSessionId
      ? sessionState.storedSessionId
      : sessionId)
  )
}

export function beginResumeSession(sessionId: string): number {
  resumeRequestId += 1
  sessionState.resumingSessionId = sessionId
  sessionState.error = null
  sessionState.resumeFailedSessionId =
    sessionState.resumeFailedSessionId === sessionId ? null : sessionState.resumeFailedSessionId
  sessionState.resumeExhaustedSessionId =
    sessionState.resumeExhaustedSessionId === sessionId ? null : sessionState.resumeExhaustedSessionId
  sessionState.storedSessionId = sessionId
  sessionState.activeSessionId = runtimeSessionIdForStored(sessionId)
  return resumeRequestId
}

export function isCurrentResumeRequest(sessionId: string, requestId: number): boolean {
  return resumeRequestId === requestId && sessionState.storedSessionId === sessionId
}

function finishResumeSession(sessionId: string, requestId: number): void {
  if (isCurrentResumeRequest(sessionId, requestId)) {
    sessionState.resumingSessionId = null
  }
}

async function refreshSessionLists(): Promise<void> {
  await loadSessions()

  if (sessionState.searchQuery.trim()) {
    await runSearch(sessionState.searchQuery.trim())
  }
}

function normalizeSearchPreview(value: null | string | undefined): string | null {
  const preview = value?.replace(/\s+/g, ' ').trim()
  return preview || null
}

function sessionForSearchResult(result: SessionSearchResult): SessionInfo | null {
  const threadId = result.lineage_root?.trim() || result.session_id

  return (
    sessionState.sessions.find(session => session.id === result.session_id || sessionThreadId(session) === threadId) ??
    null
  )
}

function enrichSearchResult(result: SessionSearchResult): SessionSearchResult {
  const knownSession = sessionForSearchResult(result)
  const lineageRoot = result.lineage_root?.trim() || null
  const profile = normalizeProfileKey(
    result.profile ??
      knownSession?.profile ??
      sessionState.sessionProfilesById[result.session_id] ??
      (lineageRoot ? sessionState.sessionProfilesById[lineageRoot] : null)
  )
  const title = result.title?.trim() || knownSession?.title?.trim() || 'Untitled session'
  const preview = normalizeSearchPreview(result.preview ?? result.snippet ?? knownSession?.preview)

  sessionState.sessionProfilesById = {
    ...sessionState.sessionProfilesById,
    [result.session_id]: profile,
    ...(lineageRoot ? { [lineageRoot]: profile } : {})
  }

  if (lineageRoot) {
    sessionState.sessionThreadIdsById = {
      ...sessionState.sessionThreadIdsById,
      [result.session_id]: lineageRoot,
      [lineageRoot]: lineageRoot
    }
  }

  return {
    ...result,
    preview,
    profile,
    title
  }
}

async function runSearch(query: string, revision = ++searchRevision): Promise<void> {
  if (!query) {
    sessionState.searchResults = []
    sessionState.searching = false
    sessionState.searchError = null
    return
  }

  sessionState.searching = true
  sessionState.searchError = null

  try {
    const result = await apiSearchSessions(query)

    if (revision === searchRevision) {
      sessionState.searchResults = result.results.map(enrichSearchResult)
      sessionState.searching = false
    }
  } catch (error) {
    if (revision === searchRevision) {
      sessionState.searchError = messageForError(error)
      sessionState.searching = false
      console.error('Search failed:', error)
    }
  }
}

function setMutating(sessionId: string, mutating: boolean): void {
  setSessionFlag(sessionState.mutatingSessionIds, sessionId, mutating)
}

/* ------------------------------------------------------------------ */
/*  Session fetch & pagination                                         */
/* ------------------------------------------------------------------ */

export async function initializeSessions(): Promise<void> {
  if (sessionState.sessionsInitialized || sessionState.sessionsLoading) return
  await loadSessions()
}

export async function loadSessions(offset = 0): Promise<void> {
  if (gatewayState.connectionState !== 'open') return

  const firstPage = offset === 0

  if (firstPage) {
    sessionState.sessionsLoading = true
  } else {
    sessionState.sessionsLoadingMore = true
  }

  sessionState.error = null

  try {
    const scope = getProfileScope() === ALL_PROFILES ? 'all' : normalizeProfileKey(getProfileScope())
    let result: PaginatedSessions

    try {
      result = await listAllProfileSessions(PAGE_SIZE, offset, 0, 'include', 'recent', scope)
    } catch (error) {
      // Backward-compatible safety valve for older single-profile dashboards.
      // The upstream multi-profile endpoint is preferred whenever available.
      if (scope !== 'all') {
        result = await apiListSessions(PAGE_SIZE, offset, 0, 'include', 'recent', scope)
      } else {
        throw error
      }
    }

    const fallbackProfile = scope === 'all' ? 'default' : scope
    const sessions = result.sessions.map(session => sessionWithProfile(session, fallbackProfile))

    recordSessionProfiles(sessions)
    sessionState.sessions = mergeSessions(sessions, offset)
    sessionState.sessionProfileTotals = result.profile_totals ?? {}
    sessionState.sessionsTotal =
      scope !== 'all' && result.profile_totals?.[scope] != null ? result.profile_totals[scope] : result.total
    sessionState.sessionsOffset = offset + sessions.length
    sessionState.sessionsInitialized = true
  } catch (error) {
    sessionState.error = messageForError(error)
    console.error('Failed to load sessions:', error)
  } finally {
    sessionState.sessionsLoading = false
    sessionState.sessionsLoadingMore = false
  }
}

export async function loadMoreSessions(): Promise<void> {
  if (sessionState.sessionsLoadingMore || !hasMoreSessions()) return
  await loadSessions(sessionState.sessionsOffset)
}

export async function loadArchivedSessions(offset = 0): Promise<void> {
  if (gatewayState.connectionState !== 'open') return

  const firstPage = offset === 0

  if (firstPage) {
    sessionState.archivedSessionsLoading = true
  } else {
    sessionState.archivedSessionsLoadingMore = true
  }

  sessionState.archivedError = null

  try {
    const scope = getProfileScope() === ALL_PROFILES ? 'all' : normalizeProfileKey(getProfileScope())
    let result: PaginatedSessions

    try {
      result = await listAllProfileSessions(PAGE_SIZE, offset, 0, 'only', 'recent', scope)
    } catch (error) {
      if (scope !== 'all') {
        result = await apiListSessions(PAGE_SIZE, offset, 0, 'only', 'recent', scope)
      } else {
        throw error
      }
    }

    const fallbackProfile = scope === 'all' ? 'default' : scope
    const sessions = result.sessions.map(session => sessionWithProfile({ ...session, archived: true }, fallbackProfile))

    recordSessionProfiles(sessions)
    sessionState.archivedSessions = mergeArchivedSessions(sessions, offset)
    sessionState.archivedSessionProfileTotals = result.profile_totals ?? {}
    sessionState.archivedSessionsTotal =
      scope !== 'all' && result.profile_totals?.[scope] != null ? result.profile_totals[scope] : result.total
    sessionState.archivedSessionsOffset = offset + sessions.length
    sessionState.archivedSessionsInitialized = true
  } catch (error) {
    sessionState.archivedError = messageForError(error)
    console.error('Failed to load archived sessions:', error)
  } finally {
    sessionState.archivedSessionsLoading = false
    sessionState.archivedSessionsLoadingMore = false
  }
}

export async function loadMoreArchivedSessions(): Promise<void> {
  if (sessionState.archivedSessionsLoadingMore || !hasMoreArchivedSessions()) return
  await loadArchivedSessions(sessionState.archivedSessionsOffset)
}

export function hasMoreArchivedSessions(): boolean {
  if (getProfileScope() !== ALL_PROFILES) {
    const scope = normalizeProfileKey(getProfileScope())
    const scopedTotal = sessionState.archivedSessionProfileTotals[scope]

    if (scopedTotal != null) {
      return sessionState.archivedSessionsOffset < scopedTotal
    }
  }

  return sessionState.archivedSessionsOffset < sessionState.archivedSessionsTotal
}

export function hasMoreSessions(): boolean {
  if (getProfileScope() !== ALL_PROFILES) {
    const scope = normalizeProfileKey(getProfileScope())
    const scopedTotal = sessionState.sessionProfileTotals[scope]

    if (scopedTotal != null) {
      return sessionState.sessionsOffset < scopedTotal
    }
  }

  return sessionState.sessionsOffset < sessionState.sessionsTotal
}

/* ------------------------------------------------------------------ */
/*  Search                                                            */
/* ------------------------------------------------------------------ */

export function setSearchQuery(query: string): void {
  sessionState.searchQuery = query

  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }

  const trimmed = query.trim()

  const revision = ++searchRevision

  if (!trimmed) {
    sessionState.searchResults = []
    sessionState.searching = false
    sessionState.searchError = null
    return
  }

  sessionState.searching = true
  searchTimeout = setTimeout(() => {
    void runSearch(trimmed, revision)
  }, SEARCH_DEBOUNCE_MS)
}

export function clearSearch(): void {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }

  searchRevision += 1
  sessionState.searchQuery = ''
  sessionState.searchResults = []
  sessionState.searching = false
  sessionState.searchError = null
}

/* ------------------------------------------------------------------ */
/*  Create / switch / resume                                           */
/* ------------------------------------------------------------------ */

/** Show the empty new-chat UI without creating a gateway session yet. */
export interface StartNewSessionOptions {
  commitRoute?: boolean
}

export function startNewSession(options: StartNewSessionOptions = {}): void {
  resumeRequestId += 1
  sessionState.resumingSessionId = null
  sessionState.activeSessionId = null
  sessionState.storedSessionId = null
  sessionState.error = null
  clearSearch()

  if (options.commitRoute !== false) {
    navigate('/')
  }
}

export async function createSession(preview: null | string = null): Promise<string | null> {
  const startingActiveSessionId = sessionState.activeSessionId
  const startingStoredSessionId = sessionState.storedSessionId
  const startingRouteToken = currentRouteToken()
  const targetProfile = normalizeProfileKey(profileState.newChatProfile ?? profileState.activeGatewayProfile)

  try {
    await ensureGatewayProfile(targetProfile)
    const response = await requestGateway<SessionCreateResponse>('session.create', {
      cols: COLS,
      profile: targetProfile
    })
    // Track both IDs per the upstream two-ID pattern:
    //   session_id — short 8-char hex sid keys the in-memory _sessions dict
    //   stored_session_id — persistent DB key survives page refresh
    // Live RPCs (prompt.submit, slash.exec) need the short sid.
    // The URL hash and session.resume need the stored key.
    const liveSid = response.session_id
    const storedKey = response.stored_session_id ?? response.session_id
    const profile = targetProfile

    if (
      sessionState.activeSessionId !== startingActiveSessionId ||
      sessionState.storedSessionId !== startingStoredSessionId ||
      currentRouteToken() !== startingRouteToken
    ) {
      await requestGateway('session.close', { session_id: liveSid, profile: targetProfile }).catch(() => undefined)
      return null
    }

    rememberRuntimeSession(storedKey, liveSid)
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey
    sessionState.sessionLineageIdsByThreadId[storedKey] = [storedKey]
    sessionState.sessionStartedAtById[storedKey] = Date.now() / 1000
    sessionState.sessionThreadIdsById[storedKey] = storedKey

    if (profile) {
      sessionState.sessionProfilesById[storedKey] = normalizeProfileKey(profile)
    }

    upsertOptimisticSession(response, storedKey, profile, preview)

    return liveSid
  } catch (error) {
    sessionState.error = messageForError(error)
    console.error('Failed to create session:', error)
    return null
  }
}

export function selectSession(sessionId: string): void {
  // Session list/search IDs are persistent stored keys. Reuse a known live sid
  // for an already-resumed session; otherwise clear it until session.resume
  // returns a fresh runtime ID. This mirrors upstream's stored→runtime cache
  // without letting a previous session's live sid poison new submits.
  const profile = profileForSession(sessionId)
  if (profile) {
    profileState.newChatProfile = profile
    void ensureGatewayProfile(profile)
  }

  sessionState.storedSessionId = sessionId
  sessionState.activeSessionId = runtimeSessionIdForStored(sessionId)
  navigate(sessionRoute(sessionId))
}

export async function resumeSession(sessionId: string, requestId?: number): Promise<SessionResumeResponse | null> {
  if (requestId === undefined && sessionState.resumingSessionId === sessionId) return null

  const activeRequestId = requestId ?? beginResumeSession(sessionId)
  const profile = profileForSession(sessionId)

  if (profile) {
    try {
      await ensureGatewayProfile(profile)
    } catch (error) {
      if (isCurrentResumeRequest(sessionId, activeRequestId)) {
        sessionState.error = messageForError(error)
      }
      finishResumeSession(sessionId, activeRequestId)
      return null
    }
  }

  const cachedRuntimeId = runtimeSessionIdForStored(sessionId)

  if (cachedRuntimeId) {
    if (!isCurrentResumeRequest(sessionId, activeRequestId)) return null

    let info: SessionResumeResponse['info']

    try {
      info = await requestGateway<NonNullable<SessionResumeResponse['info']>>('session.info', {
        session_id: cachedRuntimeId,
        ...(profile ? { profile } : {})
      })
    } catch (error) {
      if (isCurrentResumeRequest(sessionId, activeRequestId)) {
        console.error('Failed to fetch cached session info:', error)
      }
      forgetRuntimeSession(sessionId)
      sessionState.activeSessionId = null
    }

    if (info) {
      if (!isCurrentResumeRequest(sessionId, activeRequestId)) return null

      sessionState.activeSessionId = cachedRuntimeId
      sessionState.storedSessionId = sessionId
      sessionState.sessionLineageIdsByThreadId[threadIdForSessionId(sessionId) ?? sessionId] ??=
        lineageMessageSessionIds(sessionId)
      sessionState.sessionThreadIdsById[sessionId] ??= sessionId

      if (profile) {
        sessionState.sessionProfilesById[sessionId] = normalizeProfileKey(profile)
      }

      finishResumeSession(sessionId, activeRequestId)

      return {
        session_id: cachedRuntimeId,
        resumed: sessionId,
        message_count: 0,
        messages: [],
        info
      }
    }
  }

  sessionState.error = null

  try {
    const response = await requestGateway<SessionResumeResponse>('session.resume', {
      session_id: sessionId,
      ...(profile ? { profile } : {})
    })

    if (!isCurrentResumeRequest(sessionId, activeRequestId)) {
      return null
    }

    // The gateway returns a fresh live session ID (short sid) for live
    // operations.  The sessionId param is the stored key (from the URL
    // hash or session.list) — keep it as the persistent reference.
    rememberRuntimeSession(sessionId, response.session_id)
    sessionState.activeSessionId = response.session_id
    sessionState.storedSessionId = sessionId
    sessionState.sessionLineageIdsByThreadId[threadIdForSessionId(sessionId) ?? sessionId] ??=
      lineageMessageSessionIds(sessionId)
    sessionState.sessionThreadIdsById[sessionId] ??= sessionId

    if (profile) {
      sessionState.sessionProfilesById[sessionId] = normalizeProfileKey(profile)
    }

    sessionState.resumeFailedSessionId =
      sessionState.resumeFailedSessionId === sessionId ? null : sessionState.resumeFailedSessionId
    sessionState.resumeExhaustedSessionId =
      sessionState.resumeExhaustedSessionId === sessionId ? null : sessionState.resumeExhaustedSessionId

    return response
  } catch (error) {
    if (isCurrentResumeRequest(sessionId, activeRequestId)) {
      sessionState.error = messageForError(error)
      console.error('Failed to resume session:', error)
    }
    return null
  } finally {
    finishResumeSession(sessionId, activeRequestId)
  }
}

export function setActiveSession(sessionId: string | null): void {
  sessionState.activeSessionId = sessionId
  if (sessionId === null) {
    sessionState.storedSessionId = null
  }
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export async function renameSession(sessionId: string, title: string): Promise<boolean> {
  const trimmed = title.trim()

  if (!trimmed) return false

  setMutating(sessionId, true)

  try {
    const profile = profileForMutation(sessionId)
    await apiRenameSession(sessionId, trimmed, profile)
    updateSession(sessionId, { title: trimmed })
    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.error = messageForError(error)
    console.error('Failed to rename session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
  }
}

export async function archiveSession(sessionId: string, archived = true): Promise<boolean> {
  setMutating(sessionId, true)

  try {
    const mutationSessionId = threadIdForSessionId(sessionId) ?? sessionId
    const profile = profileForMutation(mutationSessionId) ?? profileForMutation(sessionId)
    await apiSetSessionArchived(mutationSessionId, archived, profile)

    if (archived) {
      removeSessionFromLocalState(sessionId)
      clearSessionPins(sessionId)
      forgetRuntimeSession(sessionId)
      if (mutationSessionId !== sessionId) {
        clearSessionPins(mutationSessionId)
        forgetRuntimeSession(mutationSessionId)
      }

      if (sessionState.storedSessionId === sessionId || sessionState.storedSessionId === mutationSessionId) {
        sessionState.activeSessionId = null
        sessionState.storedSessionId = null
        navigate('/')
      }
    }

    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.error = messageForError(error)
    console.error('Failed to archive session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
  }
}

export async function restoreArchivedSession(session: SessionInfo): Promise<boolean> {
  const sessionId = session.id
  const mutationSessionId = sessionThreadId(session)
  const profile = normalizeProfileKey(
    session.profile ?? profileForMutation(mutationSessionId) ?? profileForMutation(sessionId)
  )

  setMutating(sessionId, true)
  if (mutationSessionId !== sessionId) {
    setMutating(mutationSessionId, true)
  }

  try {
    await apiSetSessionArchived(mutationSessionId, false, profile)
    removeArchivedSessionFromLocalState(mutationSessionId)
    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.archivedError = messageForError(error)
    console.error('Failed to restore archived session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
    if (mutationSessionId !== sessionId) {
      setMutating(mutationSessionId, false)
    }
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  setMutating(sessionId, true)

  try {
    const mutationSessionId = threadIdForSessionId(sessionId) ?? sessionId
    const profile = profileForMutation(mutationSessionId) ?? profileForMutation(sessionId)
    await apiDeleteSession(mutationSessionId, profile)
    removeSessionFromLocalState(sessionId)
    clearSessionPins(sessionId)
    forgetRuntimeSession(sessionId)
    if (mutationSessionId !== sessionId) {
      clearSessionPins(mutationSessionId)
      forgetRuntimeSession(mutationSessionId)
    }

    if (sessionState.storedSessionId === sessionId || sessionState.storedSessionId === mutationSessionId) {
      sessionState.activeSessionId = null
      sessionState.storedSessionId = null
      navigate('/')
    }

    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.error = messageForError(error)
    console.error('Failed to delete session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
  }
}

/* ------------------------------------------------------------------ */
/*  Pins                                                               */
/* ------------------------------------------------------------------ */

function sessionPinId(session: SessionInfo): string {
  return sessionThreadId(session)
}

export function searchResultPinId(result: SessionSearchResult): string {
  return result.lineage_root ?? result.session_id
}

function pinSession(session: SessionInfo): void {
  storePin(sessionPinId(session))
}

function unpinSession(session: SessionInfo): void {
  storeUnpin(sessionPinId(session))
}

export function toggleSessionPinned(session: SessionInfo): void {
  if (isPinned(session)) {
    unpinSession(session)
  } else {
    pinSession(session)
  }
}

export function isPinned(session: SessionInfo): boolean {
  return isStoredPin(sessionPinId(session))
}

export function isPinnedId(pinId: string): boolean {
  return layoutState.pinnedSessionIds.includes(pinId)
}

/* ------------------------------------------------------------------ */
/*  Row indicators — Plan 04 will drive these from stream events        */
/* ------------------------------------------------------------------ */

export function setSessionWorking(sessionId: string, working: boolean): void {
  const wasWorking = sessionState.workingSessionIds.includes(sessionId)
  setSessionFlag(sessionState.workingSessionIds, sessionId, working)

  if (working) {
    clearSessionSettled(sessionId)
    armSessionWatchdog(sessionId)
  } else {
    clearSessionWatchdog(sessionId)
    if (wasWorking) {
      markSessionSettled(sessionId)
    }
  }
}

export function isSessionWorking(sessionId: string): boolean {
  return sessionState.workingSessionIds.includes(sessionId)
}

export function setSessionNeedsInput(sessionId: string, needsInput: boolean): void {
  setSessionFlag(sessionState.needsInputSessionIds, sessionId, needsInput)
}

export function sessionNeedsInput(sessionId: string): boolean {
  return sessionState.needsInputSessionIds.includes(sessionId)
}

export function isSessionMutating(sessionId: string): boolean {
  return sessionState.mutatingSessionIds.includes(sessionId)
}
