import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequestGateway,
  mockNavigate,
  mockSessionRoute,
  mockEnsureGatewayForProfile,
  mockApiRenameSession,
  mockApiSetSessionArchived,
  mockApiDeleteSession,
  mockApiListSessions,
  mockApiListAllProfileSessions,
  mockApiSearchSessions,
  mockSetApiRequestProfile
} = vi.hoisted(() => ({
  mockRequestGateway: vi.fn(),
  mockNavigate: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`),
  mockEnsureGatewayForProfile: vi.fn(),
  mockApiRenameSession: vi.fn(),
  mockApiSetSessionArchived: vi.fn(),
  mockApiDeleteSession: vi.fn(),
  mockApiListSessions: vi.fn(),
  mockApiListAllProfileSessions: vi.fn(),
  mockApiSearchSessions: vi.fn(),
  mockSetApiRequestProfile: vi.fn()
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  requestGateway: mockRequestGateway,
  ensureGatewayForProfile: mockEnsureGatewayForProfile,
  gatewayState: {}
}))

vi.mock('@/app/agent/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: {}
}))

vi.mock('$lib/api/dashboard', () => ({
  deleteSession: mockApiDeleteSession,
  listAllProfileSessions: mockApiListAllProfileSessions,
  listSessions: mockApiListSessions,
  renameSession: mockApiRenameSession,
  searchSessions: mockApiSearchSessions,
  setApiRequestProfile: mockSetApiRequestProfile,
  setSessionArchived: mockApiSetSessionArchived
}))

import {
  archiveSession,
  collapseArchivedSessionsToThreads,
  collapseSessionsToThreads,
  createSession,
  deleteSession,
  hasMoreSessions,
  loadArchivedSessions,
  loadSessions,
  lineageMessageSessionIds,
  rememberRuntimeSession,
  renameSession,
  restoreArchivedSession,
  resumeSession,
  runtimeSessionIdForStored,
  selectSession,
  setSearchQuery,
  sessionState as rawSessionState,
  sessionThreadId,
  startNewSession,
  storedSessionIdForRuntime
} from '$lib/stores/session.svelte'
import { profileState } from '$lib/stores/profile.svelte'
import { gatewayState } from '$lib/stores/gateway.svelte'
import type { SessionInfo } from '$lib/types/hermes'

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    archived: false,
    cwd: null,
    ended_at: null,
    id: 'session-id',
    input_tokens: 0,
    is_active: false,
    last_active: 100,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    source: 'cli',
    started_at: 100,
    title: 'Session title',
    tool_call_count: 0,
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, reject, resolve }
}

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.storedSessionId = null
    rawSessionState.error = null
    rawSessionState.runtimeIdsByStoredSessionId = {}
    rawSessionState.storedSessionIdsByRuntimeId = {}
    rawSessionState.sessionProfilesById = {}
    rawSessionState.sessionThreadIdsById = {}
    profileState.activeGatewayProfile = 'default'
    profileState.newChatProfile = null
  })

  it('sets activeSessionId to short sid and storedSessionId to persistent key without navigating', async () => {
    const liveSid = 'abc12345'
    const storedKey = 'sess_key_XYZ'

    mockRequestGateway.mockResolvedValueOnce({
      session_id: liveSid,
      stored_session_id: storedKey,
      message_count: 0,
      messages: [],
      info: { model: 'test-model' }
    })

    const result = await createSession()

    // Returns the short sid for callers that need it (e.g. submitPrompt)
    expect(result).toBe(liveSid)
    expect(result).not.toBe(storedKey)

    // Both IDs tracked
    expect(rawSessionState.activeSessionId).toBe(liveSid)
    expect(rawSessionState.storedSessionId).toBe(storedKey)

    // Route stays put until the first successful submit
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('forwards the selected new-chat profile into session.create and caches it immediately', async () => {
    profileState.newChatProfile = 'crypto'

    mockEnsureGatewayForProfile.mockResolvedValueOnce(undefined)
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'crypto-live',
      stored_session_id: 'crypto-stored',
      message_count: 0,
      messages: [],
      info: { model: 'test-model' }
    })

    await expect(createSession()).resolves.toBe('crypto-live')

    expect(mockEnsureGatewayForProfile).toHaveBeenCalledWith('crypto')
    expect(mockRequestGateway).toHaveBeenCalledWith('session.create', {
      cols: 96,
      profile: 'crypto'
    })
    expect(rawSessionState.sessionProfilesById['crypto-stored']).toBe('crypto')
  })

  it('falls back to session_id for stored key when stored_session_id is absent', async () => {
    const liveSid = 'deadbeef'

    mockRequestGateway.mockResolvedValueOnce({
      session_id: liveSid,
      stored_session_id: undefined,
      message_count: 0,
      messages: [],
      info: { model: 'test-model' }
    })

    await createSession()

    expect(rawSessionState.activeSessionId).toBe(liveSid)
    expect(rawSessionState.storedSessionId).toBe(liveSid)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('returns null on gateway error and sets error state', async () => {
    mockRequestGateway.mockRejectedValueOnce(new Error('gateway down'))

    const result = await createSession()

    expect(result).toBeNull()
    expect(rawSessionState.error).toBeTruthy()
    expect(rawSessionState.storedSessionId).toBeNull()
  })

  it('closes a newly created live session when route state changes before create resolves', async () => {
    const pendingCreate = deferred<{
      info: { model: string }
      message_count: number
      messages: []
      session_id: string
      stored_session_id: string
    }>()

    mockRequestGateway.mockImplementation((method: string, params?: Record<string, unknown>) => {
      if (method === 'session.create') return pendingCreate.promise
      if (method === 'session.close') return Promise.resolve({ closed: params?.session_id })
      return Promise.resolve({})
    })

    const resultPromise = createSession()
    rawSessionState.storedSessionId = 'operator-clicked-elsewhere'
    pendingCreate.resolve({
      session_id: 'stale001',
      stored_session_id: 'stored-stale',
      message_count: 0,
      messages: [],
      info: { model: 'test-model' }
    })

    await expect(resultPromise).resolves.toBeNull()
    expect(mockRequestGateway).toHaveBeenCalledWith('session.close', { profile: 'default', session_id: 'stale001' })
    expect(rawSessionState.activeSessionId).not.toBe('stale001')
    expect(rawSessionState.storedSessionId).toBe('operator-clicked-elsewhere')
    expect(mockNavigate).not.toHaveBeenCalledWith('/stored-stale')
  })
})

describe('startNewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = 'live-old'
    rawSessionState.storedSessionId = 'stored-old'
    rawSessionState.error = 'stale error'
    rawSessionState.resumingSessionId = 'stored-old'
  })

  it('clears active session state and navigates to the new-chat route', () => {
    startNewSession()

    expect(rawSessionState.activeSessionId).toBeNull()
    expect(rawSessionState.storedSessionId).toBeNull()
    expect(rawSessionState.error).toBeNull()
    expect(rawSessionState.resumingSessionId).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

describe('selectSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = 'oldlive1'
    rawSessionState.storedSessionId = 'old-stored-key'
    rawSessionState.error = null
    rawSessionState.runtimeIdsByStoredSessionId = {}
    rawSessionState.storedSessionIdsByRuntimeId = {}
  })

  it('selects by stored key without poisoning the live active session id', () => {
    selectSession('stored_key_abc')

    expect(rawSessionState.storedSessionId).toBe('stored_key_abc')
    expect(rawSessionState.activeSessionId).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/stored_key_abc')
  })

  it('reuses a cached runtime id when reselecting an already-resumed stored session', () => {
    rememberRuntimeSession('stored_key_abc', 'liveabc1')

    selectSession('stored_key_abc')

    expect(rawSessionState.storedSessionId).toBe('stored_key_abc')
    expect(rawSessionState.activeSessionId).toBe('liveabc1')
    expect(mockNavigate).toHaveBeenCalledWith('/stored_key_abc')
  })
})

describe('resumeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.storedSessionId = null
    rawSessionState.error = null
    rawSessionState.resumingSessionId = null
    rawSessionState.runtimeIdsByStoredSessionId = {}
    rawSessionState.storedSessionIdsByRuntimeId = {}
  })

  it('records runtime mappings when a stored session is resumed', async () => {
    const liveSid = 'mapped01'
    const storedKey = 'stored-map-1'

    mockRequestGateway.mockResolvedValueOnce({
      session_id: liveSid,
      resumed: storedKey,
      message_count: 5,
      messages: [],
      info: { model: 'test-model' }
    })

    await resumeSession(storedKey)

    expect(runtimeSessionIdForStored(storedKey)).toBe(liveSid)
    expect(storedSessionIdForRuntime(liveSid)).toBe(storedKey)
  })

  it('reuses a cached runtime id for a stored session without re-resuming the gateway', async () => {
    rememberRuntimeSession('stored-cached', 'livecache')

    const response = await resumeSession('stored-cached')

    expect(response?.session_id).toBe('livecache')
    expect(rawSessionState.activeSessionId).toBe('livecache')
    expect(rawSessionState.storedSessionId).toBe('stored-cached')
    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.resume', expect.anything())
  })

  it('ignores stale resume responses when another session became selected first', async () => {
    const pendingA = deferred<{
      info: { model: string }
      message_count: number
      messages: []
      resumed: string
      session_id: string
    }>()
    const pendingB = deferred<{
      info: { model: string }
      message_count: number
      messages: []
      resumed: string
      session_id: string
    }>()

    mockRequestGateway.mockImplementation((_method: string, params?: Record<string, unknown>) => {
      if (params?.session_id === 'stored-A') return pendingA.promise
      if (params?.session_id === 'stored-B') return pendingB.promise
      return Promise.resolve({})
    })

    const resumeA = resumeSession('stored-A')
    const resumeB = resumeSession('stored-B')

    pendingB.resolve({
      session_id: 'live-B',
      resumed: 'stored-B',
      message_count: 0,
      messages: [],
      info: { model: 'b' }
    })
    await expect(resumeB).resolves.toMatchObject({ session_id: 'live-B' })
    expect(rawSessionState.activeSessionId).toBe('live-B')
    expect(rawSessionState.storedSessionId).toBe('stored-B')

    pendingA.resolve({
      session_id: 'live-A',
      resumed: 'stored-A',
      message_count: 0,
      messages: [],
      info: { model: 'a' }
    })
    await expect(resumeA).resolves.toBeNull()
    expect(rawSessionState.activeSessionId).toBe('live-B')
    expect(rawSessionState.storedSessionId).toBe('stored-B')
    expect(runtimeSessionIdForStored('stored-A')).toBeNull()
  })

  it('sets activeSessionId to response.session_id and storedSessionId to the param', async () => {
    const liveSid = 'newlive01'
    const storedKey = 'stored_key_abc'

    mockRequestGateway.mockResolvedValueOnce({
      session_id: liveSid,
      resumed: storedKey,
      message_count: 5,
      messages: [],
      info: { model: 'test-model' }
    })

    const response = await resumeSession(storedKey)

    expect(response).not.toBeNull()
    expect(response!.session_id).toBe(liveSid)
    expect(rawSessionState.activeSessionId).toBe(liveSid)
    expect(rawSessionState.activeSessionId).not.toBe(storedKey)

    // The stored key is preserved for re-resume on page refresh
    expect(rawSessionState.storedSessionId).toBe(storedKey)

    // The gateway call passes the stored key (the param)
    expect(mockRequestGateway).toHaveBeenCalledWith(
      'session.resume',
      expect.objectContaining({ session_id: storedKey })
    )
  })

  it('guards against double resume of the same session', async () => {
    rawSessionState.resumingSessionId = 'stored_key_abc'

    const result = await resumeSession('stored_key_abc')

    expect(result).toBeNull()
    expect(mockRequestGateway).not.toHaveBeenCalled()
  })

  it('returns null on gateway error, sets error state, and keeps the selected stored route', async () => {
    mockRequestGateway.mockRejectedValueOnce(new Error('not found'))

    const result = await resumeSession('bad_id')

    expect(result).toBeNull()
    expect(rawSessionState.error).toBeTruthy()
    expect(rawSessionState.storedSessionId).toBe('bad_id')
  })
})

describe('session mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.storedSessionId = null
    rawSessionState.error = null
    rawSessionState.mutatingSessionIds = []
    rawSessionState.sessions = [
      {
        archived: false,
        cwd: null,
        ended_at: 123,
        id: 'stored-A',
        input_tokens: 0,
        is_active: false,
        last_active: 456,
        message_count: 3,
        model: null,
        output_tokens: 0,
        preview: null,
        profile: 'crypto/profile',
        source: 'cli',
        started_at: 100,
        title: 'Old title',
        tool_call_count: 0
      }
    ]
    rawSessionState.sessionsTotal = 1
    rawSessionState.sessionProfileTotals = { 'crypto/profile': 1 }
    rawSessionState.sessionProfilesById = { 'stored-A': 'crypto/profile' }
    rawSessionState.runtimeIdsByStoredSessionId = { 'stored-A': 'live-A' }
    rawSessionState.storedSessionIdsByRuntimeId = { 'live-A': 'stored-A' }
    profileState.activeGatewayProfile = 'default'
    profileState.showAllProfiles = true
    mockApiListAllProfileSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
    mockApiListSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
  })

  it('renames using the row owning profile and updates local title', async () => {
    mockApiRenameSession.mockResolvedValueOnce({ ok: true, title: 'New title' })

    await expect(renameSession('stored-A', ' New title ')).resolves.toBe(true)

    expect(mockApiRenameSession).toHaveBeenCalledWith('stored-A', 'New title', 'crypto/profile')
    expect(rawSessionState.sessions[0]?.title).toBe('New title')
  })

  it('archives using the row owning profile and removes only that profile count locally', async () => {
    mockApiSetSessionArchived.mockResolvedValueOnce({ ok: true, archived: true })

    await expect(archiveSession('stored-A')).resolves.toBe(true)

    expect(mockApiSetSessionArchived).toHaveBeenCalledWith('stored-A', true, 'crypto/profile')
    expect(rawSessionState.sessions).toHaveLength(0)
    expect(rawSessionState.sessionsTotal).toBe(0)
    expect(rawSessionState.sessionProfileTotals['crypto/profile']).toBe(0)
    expect(runtimeSessionIdForStored('stored-A')).toBeNull()
  })

  it('deletes using the row owning profile and navigates away when selected', async () => {
    rawSessionState.activeSessionId = 'live-A'
    rawSessionState.storedSessionId = 'stored-A'
    mockApiDeleteSession.mockResolvedValueOnce({ ok: true })

    await expect(deleteSession('stored-A')).resolves.toBe(true)

    expect(mockApiDeleteSession).toHaveBeenCalledWith('stored-A', 'crypto/profile')
    expect(rawSessionState.sessions).toHaveLength(0)
    expect(rawSessionState.activeSessionId).toBeNull()
    expect(rawSessionState.storedSessionId).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('leaves profile-owned rows in place when delete fails', async () => {
    mockApiDeleteSession.mockRejectedValueOnce(new Error('not found in profile'))

    await expect(deleteSession('stored-A')).resolves.toBe(false)

    expect(rawSessionState.sessions.map(session => session.id)).toEqual(['stored-A'])
    expect(rawSessionState.sessionProfileTotals['crypto/profile']).toBe(1)
    expect(rawSessionState.error).toBe('not found in profile')
  })
})

describe('archived sessions', () => {
  afterEach(() => {
    gatewayState.connectionState = 'idle'
  })

  beforeEach(() => {
    vi.clearAllMocks()
    gatewayState.connectionState = 'open'
    profileState.showAllProfiles = true
    profileState.activeGatewayProfile = 'default'
    rawSessionState.archivedError = null
    rawSessionState.archivedSessionProfileTotals = {}
    rawSessionState.archivedSessions = []
    rawSessionState.archivedSessionsInitialized = false
    rawSessionState.archivedSessionsLoading = false
    rawSessionState.archivedSessionsLoadingMore = false
    rawSessionState.archivedSessionsOffset = 0
    rawSessionState.archivedSessionsTotal = 0
    rawSessionState.error = null
    rawSessionState.mutatingSessionIds = []
    rawSessionState.sessionProfilesById = {}
    rawSessionState.sessionThreadIdsById = {}
    rawSessionState.sessions = []
    mockApiListAllProfileSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
    mockApiListSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
  })

  it('loads only archived sessions for the active profile scope', async () => {
    const archived = session({
      archived: true,
      id: 'archived-A',
      last_active: 456,
      message_count: 3,
      profile: 'crypto/profile',
      title: 'Archived plan'
    })

    mockApiListAllProfileSessions.mockResolvedValueOnce({
      sessions: [archived],
      total: 1,
      limit: 40,
      offset: 0,
      profile_totals: { 'crypto/profile': 1 }
    })

    await loadArchivedSessions()

    expect(mockApiListAllProfileSessions).toHaveBeenCalledWith(40, 0, 0, 'only', 'recent', 'all')
    expect(rawSessionState.archivedSessions).toHaveLength(1)
    expect(rawSessionState.archivedSessions[0]).toMatchObject({ id: 'archived-A', title: 'Archived plan' })
    expect(rawSessionState.sessionProfilesById['archived-A']).toBe('crypto/profile')
  })

  it('restores archived sessions using their owning profile and refreshes recents', async () => {
    const archived = session({
      archived: true,
      id: 'archived-A',
      profile: 'crypto/profile',
      title: 'Archived plan'
    })

    rawSessionState.archivedSessions = [archived]
    rawSessionState.archivedSessionsTotal = 1
    rawSessionState.archivedSessionProfileTotals = { 'crypto/profile': 1 }
    rawSessionState.sessionProfilesById = { 'archived-A': 'crypto/profile' }
    rawSessionState.sessionThreadIdsById = { 'archived-A': 'archived-A' }
    mockApiSetSessionArchived.mockResolvedValueOnce({ ok: true })

    await expect(restoreArchivedSession(archived)).resolves.toBe(true)

    expect(mockApiSetSessionArchived).toHaveBeenCalledWith('archived-A', false, 'crypto/profile')
    expect(rawSessionState.archivedSessions).toEqual([])
    expect(rawSessionState.archivedSessionsTotal).toBe(0)
    expect(mockApiListAllProfileSessions).toHaveBeenCalledWith(40, 0, 0, 'include', 'recent', 'all')
  })

  it('collapses archived lineage rows into one restorable thread row', () => {
    const rows = collapseArchivedSessionsToThreads([
      session({
        archived: true,
        id: 'thread-root',
        last_active: 10,
        message_count: 2,
        title: 'Root title'
      }),
      session({
        _lineage_root_id: 'thread-root',
        archived: true,
        id: 'thread-tip',
        last_active: 20,
        message_count: 4,
        title: 'Tip title'
      })
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      _lineage_root_id: 'thread-root',
      archived: true,
      id: 'thread-tip',
      message_count: 6,
      title: 'Tip title'
    })
  })
})

describe('session search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    rawSessionState.searchError = null
    rawSessionState.searchQuery = ''
    rawSessionState.searchResults = []
    rawSessionState.searching = false
    rawSessionState.sessionProfilesById = {}
    rawSessionState.sessionThreadIdsById = {}
    rawSessionState.sessions = [
      session({
        id: 'stored-A',
        profile: 'crypto/profile',
        title: 'Deploy plan'
      })
    ]
  })

  afterEach(() => {
    setSearchQuery('')
    vi.useRealTimers()
  })

  it('enriches search rows with session titles and matching previews', async () => {
    mockApiSearchSessions.mockResolvedValueOnce({
      results: [
        {
          lineage_root: null,
          model: 'claude-opus',
          role: 'user',
          session_id: 'stored-A',
          session_started: 100,
          snippet: 'matching\nquery text',
          source: 'cli'
        }
      ]
    })

    setSearchQuery('matching')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockApiSearchSessions).toHaveBeenCalledWith('matching')
    expect(rawSessionState.searchResults[0]).toMatchObject({
      preview: 'matching query text',
      profile: 'crypto/profile',
      title: 'Deploy plan'
    })
  })
})

describe('session lineage mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.storedSessionId = null
    rawSessionState.error = null
    rawSessionState.mutatingSessionIds = []
    rawSessionState.sessions = [
      {
        _lineage_root_id: 'stored-root',
        archived: false,
        cwd: null,
        ended_at: 123,
        id: 'stored-tip',
        input_tokens: 0,
        is_active: false,
        last_active: 456,
        message_count: 3,
        model: null,
        output_tokens: 0,
        preview: null,
        profile: 'crypto/profile',
        source: 'cli',
        started_at: 100,
        title: 'Old title #2',
        tool_call_count: 0
      }
    ]
    rawSessionState.sessionsTotal = 1
    rawSessionState.sessionProfileTotals = { 'crypto/profile': 1 }
    rawSessionState.sessionProfilesById = {
      'stored-root': 'crypto/profile',
      'stored-tip': 'crypto/profile'
    }
    rawSessionState.sessionThreadIdsById = {
      'stored-root': 'stored-root',
      'stored-tip': 'stored-root'
    }
    rawSessionState.runtimeIdsByStoredSessionId = { 'stored-tip': 'live-tip' }
    rawSessionState.storedSessionIdsByRuntimeId = { 'live-tip': 'stored-tip' }
    profileState.activeGatewayProfile = 'default'
    profileState.showAllProfiles = true
    mockApiListAllProfileSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
    mockApiListSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
  })

  it('archives continuation rows through their lineage root and clears the collapsed row', async () => {
    mockApiSetSessionArchived.mockResolvedValueOnce({ ok: true, archived: true })

    await expect(archiveSession('stored-tip')).resolves.toBe(true)

    expect(mockApiSetSessionArchived).toHaveBeenCalledWith('stored-root', true, 'crypto/profile')
    expect(rawSessionState.sessions).toHaveLength(0)
    expect(rawSessionState.sessionsTotal).toBe(0)
    expect(rawSessionState.sessionProfileTotals['crypto/profile']).toBe(0)
    expect(rawSessionState.runtimeIdsByStoredSessionId).toEqual({})
    expect(rawSessionState.storedSessionIdsByRuntimeId).toEqual({})
  })

  it('deletes continuation rows through their lineage root and navigates away when selected', async () => {
    rawSessionState.activeSessionId = 'live-tip'
    rawSessionState.storedSessionId = 'stored-tip'
    mockApiDeleteSession.mockResolvedValueOnce({ ok: true })

    await expect(deleteSession('stored-tip')).resolves.toBe(true)

    expect(mockApiDeleteSession).toHaveBeenCalledWith('stored-root', 'crypto/profile')
    expect(rawSessionState.sessions).toHaveLength(0)
    expect(rawSessionState.activeSessionId).toBeNull()
    expect(rawSessionState.storedSessionId).toBeNull()
    expect(rawSessionState.runtimeIdsByStoredSessionId).toEqual({})
    expect(rawSessionState.storedSessionIdsByRuntimeId).toEqual({})
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

describe('profile-scoped pagination', () => {
  beforeEach(() => {
    rawSessionState.sessionsOffset = 0
    rawSessionState.sessionsTotal = 0
    rawSessionState.sessionProfileTotals = {}
    profileState.activeGatewayProfile = 'default'
    profileState.showAllProfiles = false
  })

  it('uses profile_totals for scoped pagination', () => {
    profileState.activeGatewayProfile = 'crypto'
    rawSessionState.sessionsOffset = 40
    rawSessionState.sessionsTotal = 200
    rawSessionState.sessionProfileTotals = { crypto: 40 }

    expect(hasMoreSessions()).toBe(false)
  })

  it('falls back to global total in all-profiles mode', () => {
    profileState.showAllProfiles = true
    rawSessionState.sessionsOffset = 40
    rawSessionState.sessionsTotal = 80
    rawSessionState.sessionProfileTotals = { default: 40 }

    expect(hasMoreSessions()).toBe(true)
  })
})

describe('session lineage threads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gatewayState.connectionState = 'open'
    profileState.showAllProfiles = true
    rawSessionState.sessionLineageIdsByThreadId = {}
    rawSessionState.sessionProfilesById = {}
    rawSessionState.sessionStartedAtById = {}
    rawSessionState.sessionThreadIdsById = {}
    rawSessionState.sessions = []
    mockApiListAllProfileSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
    mockApiListSessions.mockResolvedValue({ sessions: [], total: 0, limit: 40, offset: 0 })
  })

  it('uses the lineage root as the stable thread id', () => {
    expect(sessionThreadId({ id: 'BITCH-3', _lineage_root_id: 'BITCH' })).toBe('BITCH')
    expect(sessionThreadId({ id: 'BITCH-3', lineage_root: 'BITCH' })).toBe('BITCH')
    expect(sessionThreadId({ id: 'solo', _lineage_root_id: null })).toBe('solo')
  })

  it('strips generated lineage suffixes from sidebar titles when a thread advances', () => {
    const threads = collapseSessionsToThreads([
      session({
        id: 'thread-root',
        last_active: 10,
        started_at: 10,
        title: 'Deploy plan'
      }),
      session({
        _lineage_root_id: 'thread-root',
        id: 'thread-tip',
        last_active: 20,
        started_at: 20,
        title: 'Deploy plan #2'
      })
    ])

    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      _lineage_root_id: 'thread-root',
      id: 'thread-tip',
      title: 'Deploy plan'
    })
  })

  it('preserves hash-number titles for standalone sessions', () => {
    const threads = collapseSessionsToThreads([
      session({
        id: 'solo',
        last_active: 10,
        started_at: 10,
        title: 'Plan #2'
      })
    ])

    expect(threads[0]).toMatchObject({ id: 'solo', title: 'Plan #2' })
  })

  it('records lineage members in chronological order for compressed threads loaded from the gateway', async () => {
    mockApiListAllProfileSessions.mockResolvedValueOnce({
      sessions: [
        session({
          _lineage_root_id: 'BITCH',
          archived: false,
          id: 'BITCH-3',
          last_active: 60,
          started_at: 50,
          title: 'BITCH #3'
        }),
        session({
          _lineage_root_id: null,
          archived: true,
          id: 'BITCH',
          last_active: 20,
          started_at: 10,
          title: 'BITCH'
        }),
        session({
          _lineage_root_id: 'BITCH',
          archived: true,
          id: 'BITCH-2',
          last_active: 40,
          started_at: 30,
          title: 'BITCH #2'
        })
      ],
      total: 3,
      limit: 40,
      offset: 0
    })

    await loadSessions()

    expect(lineageMessageSessionIds('BITCH-3')).toEqual(['BITCH', 'BITCH-2', 'BITCH-3'])
    expect(rawSessionState.sessions).toHaveLength(1)
    expect(rawSessionState.sessions[0]).toMatchObject({ id: 'BITCH-3', _lineage_root_id: 'BITCH' })
  })

  it('collapses archived compression predecessors behind the latest visible continuation tip without masking its title', () => {
    const threads = collapseSessionsToThreads([
      {
        _lineage_root_id: null,
        archived: true,
        cwd: null,
        ended_at: 20,
        id: 'BITCH',
        input_tokens: 10,
        is_active: false,
        last_active: 20,
        message_count: 5,
        model: 'claude-opus',
        output_tokens: 20,
        preview: 'root preview',
        profile: 'default',
        source: 'cli',
        started_at: 10,
        title: 'BITCH',
        tool_call_count: 1
      },
      {
        _lineage_root_id: 'BITCH',
        archived: true,
        cwd: null,
        ended_at: 40,
        id: 'BITCH-2',
        input_tokens: 30,
        is_active: false,
        last_active: 40,
        message_count: 7,
        model: 'claude-opus',
        output_tokens: 40,
        preview: 'middle preview',
        profile: 'default',
        source: 'cli',
        started_at: 30,
        title: 'BITCH #2',
        tool_call_count: 2
      },
      {
        _lineage_root_id: 'BITCH',
        archived: false,
        cwd: null,
        ended_at: null,
        id: 'BITCH-3',
        input_tokens: 50,
        is_active: true,
        last_active: 60,
        message_count: 9,
        model: 'claude-opus',
        output_tokens: 60,
        preview: 'latest preview',
        profile: 'default',
        source: 'cli',
        started_at: 50,
        title: 'BITCH #3',
        tool_call_count: 3
      }
    ])

    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      _lineage_root_id: 'BITCH',
      archived: false,
      id: 'BITCH-3',
      is_active: true,
      last_active: 60,
      message_count: 21,
      preview: 'latest preview',
      title: 'BITCH',
      tool_call_count: 6
    })
  })

  it('does not resurrect explicitly archived sessions that have no visible continuation tip', () => {
    const threads = collapseSessionsToThreads([
      {
        archived: true,
        cwd: null,
        ended_at: 20,
        id: 'archived-solo',
        input_tokens: 0,
        is_active: false,
        last_active: 20,
        message_count: 5,
        model: null,
        output_tokens: 0,
        preview: 'hidden',
        profile: 'default',
        source: 'cli',
        started_at: 10,
        title: 'Archived solo',
        tool_call_count: 0
      }
    ])

    expect(threads).toEqual([])
  })

  it('keeps an archived continuation tip hidden instead of restoring an older ancestor', () => {
    const threads = collapseSessionsToThreads([
      {
        _lineage_root_id: null,
        archived: false,
        cwd: null,
        ended_at: 20,
        id: 'BITCH',
        input_tokens: 10,
        is_active: false,
        last_active: 20,
        message_count: 5,
        model: 'claude-opus',
        output_tokens: 20,
        preview: 'root preview',
        profile: 'default',
        source: 'cli',
        started_at: 10,
        title: 'BITCH',
        tool_call_count: 1
      },
      {
        _lineage_root_id: 'BITCH',
        archived: true,
        cwd: null,
        ended_at: 40,
        id: 'BITCH-2',
        input_tokens: 30,
        is_active: false,
        last_active: 40,
        message_count: 7,
        model: 'claude-opus',
        output_tokens: 40,
        preview: 'middle preview',
        profile: 'default',
        source: 'cli',
        started_at: 30,
        title: 'BITCH #2',
        tool_call_count: 2
      }
    ])

    expect(threads).toEqual([])
  })
})
