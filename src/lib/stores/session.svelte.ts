import {
  listSessions as apiListSessions,
  searchSessions as apiSearchSessions,
  renameSession as apiRenameSession,
  setSessionArchived as apiSetSessionArchived,
  deleteSession as apiDeleteSession
} from '$lib/dashboard-api'
import { gatewayState, requestGateway } from '$lib/stores/gateway.svelte'
import {
  isPinned as isStoredPin,
  layoutState,
  pinSession as storePin,
  unpinSession as storeUnpin
} from '$lib/stores/layout.svelte'
import type { SessionCreateResponse, SessionInfo, SessionResumeResponse, SessionSearchResult } from '$lib/types/hermes'
import { navigate, sessionRoute } from '../../app/router.svelte'

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
  activeSessionId: string | null
  error: string | null
  mutatingSessionIds: string[]
  needsInputSessionIds: string[]
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
  workingSessionIds: string[]
}

/* ------------------------------------------------------------------ */
/*  Reactive state                                                     */
/* ------------------------------------------------------------------ */

export const sessionState = $state<SessionState>({
  activeSessionId: null,
  error: null,
  mutatingSessionIds: [],
  needsInputSessionIds: [],
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
  workingSessionIds: []
})

let searchTimeout: ReturnType<typeof setTimeout> | null = null
let searchRevision = 0

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function updateSession(sessionId: string, patch: Partial<SessionInfo>): void {
  const session = sessionState.sessions.find(item => item.id === sessionId)

  if (session) {
    Object.assign(session, patch)
  }
}

function removeSessionFromLocalState(sessionId: string): void {
  const before = sessionState.sessions.length
  sessionState.sessions = sessionState.sessions.filter(session => session.id !== sessionId)

  if (sessionState.sessions.length !== before && sessionState.sessionsTotal > 0) {
    sessionState.sessionsTotal -= 1
  }
}

function mergeSessions(incoming: SessionInfo[], offset: number): SessionInfo[] {
  const existingKeepers =
    offset === 0
      ? sessionState.sessions.filter(session => isPinned(session) || session.id === sessionState.activeSessionId)
      : sessionState.sessions
  const merged = new Map<string, SessionInfo>()

  for (const session of [...incoming, ...existingKeepers]) {
    if (!merged.has(session.id)) {
      merged.set(session.id, session)
    }
  }

  return [...merged.values()]
}

function setSessionFlag(list: string[], sessionId: string, enabled: boolean): void {
  const index = list.indexOf(sessionId)

  if (enabled && index === -1) {
    list.push(sessionId)
  } else if (!enabled && index !== -1) {
    list.splice(index, 1)
  }
}

async function refreshSessionLists(): Promise<void> {
  await loadSessions()

  if (sessionState.searchQuery.trim()) {
    await runSearch(sessionState.searchQuery.trim())
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
      sessionState.searchResults = result.results
      sessionState.searching = false
    }
  } catch (error) {
    if (revision === searchRevision) {
      sessionState.searchError = messageFor(error)
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
    const result = await apiListSessions(PAGE_SIZE, offset, 0, 'exclude', 'recent')

    sessionState.sessions = mergeSessions(result.sessions, offset)
    sessionState.sessionsTotal = result.total
    sessionState.sessionsOffset = offset + result.sessions.length
    sessionState.sessionsInitialized = true
  } catch (error) {
    sessionState.error = messageFor(error)
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

export function hasMoreSessions(): boolean {
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

export async function createSession(): Promise<string | null> {
  try {
    const response = await requestGateway<SessionCreateResponse>('session.create', { cols: COLS })
    const sessionId = response.stored_session_id ?? response.session_id

    sessionState.activeSessionId = sessionId
    navigate(sessionRoute(sessionId))
    clearSearch()
    await loadSessions()

    return sessionId
  } catch (error) {
    sessionState.error = messageFor(error)
    console.error('Failed to create session:', error)
    return null
  }
}

export function selectSession(sessionId: string): void {
  sessionState.activeSessionId = sessionId
  navigate(sessionRoute(sessionId))
}

export async function resumeSession(sessionId: string): Promise<SessionResumeResponse | null> {
  if (sessionState.resumingSessionId === sessionId) return null

  sessionState.resumingSessionId = sessionId
  sessionState.error = null

  try {
    const response = await requestGateway<SessionResumeResponse>('session.resume', { session_id: sessionId })

    sessionState.activeSessionId = sessionId
    return response
  } catch (error) {
    sessionState.error = messageFor(error)
    console.error('Failed to resume session:', error)
    return null
  } finally {
    sessionState.resumingSessionId = null
  }
}

export function setActiveSession(sessionId: string | null): void {
  sessionState.activeSessionId = sessionId
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export async function renameSession(sessionId: string, title: string): Promise<boolean> {
  const trimmed = title.trim()

  if (!trimmed) return false

  setMutating(sessionId, true)

  try {
    await apiRenameSession(sessionId, trimmed)
    updateSession(sessionId, { title: trimmed })
    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.error = messageFor(error)
    console.error('Failed to rename session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
  }
}

export async function archiveSession(sessionId: string, archived = true): Promise<boolean> {
  setMutating(sessionId, true)

  try {
    await apiSetSessionArchived(sessionId, archived)

    if (archived) {
      removeSessionFromLocalState(sessionId)

      if (sessionState.activeSessionId === sessionId) {
        sessionState.activeSessionId = null
        navigate('/')
      }
    }

    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.error = messageFor(error)
    console.error('Failed to archive session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  setMutating(sessionId, true)

  try {
    await apiDeleteSession(sessionId)
    removeSessionFromLocalState(sessionId)

    if (sessionState.activeSessionId === sessionId) {
      sessionState.activeSessionId = null
      navigate('/')
    }

    await refreshSessionLists()
    return true
  } catch (error) {
    sessionState.error = messageFor(error)
    console.error('Failed to delete session:', error)
    return false
  } finally {
    setMutating(sessionId, false)
  }
}

/* ------------------------------------------------------------------ */
/*  Pins                                                               */
/* ------------------------------------------------------------------ */

export function sessionPinId(session: SessionInfo): string {
  return session._lineage_root_id ?? session.id
}

export function searchResultPinId(result: SessionSearchResult): string {
  return result.lineage_root ?? result.session_id
}

export function pinSession(session: SessionInfo): void {
  storePin(sessionPinId(session))
}

export function unpinSession(session: SessionInfo): void {
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
  setSessionFlag(sessionState.workingSessionIds, sessionId, working)
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
