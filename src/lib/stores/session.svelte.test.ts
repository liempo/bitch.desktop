import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockRequestGateway, mockNavigate, mockSessionRoute, mockEnsureGatewayForProfile } = vi.hoisted(() => ({
  mockRequestGateway: vi.fn(),
  mockNavigate: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`),
  mockEnsureGatewayForProfile: vi.fn()
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  requestGateway: mockRequestGateway,
  ensureGatewayForProfile: mockEnsureGatewayForProfile,
  gatewayState: {}
}))

vi.mock('../../app/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: {}
}))

import {
  createSession,
  hasMoreSessions,
  rememberRuntimeSession,
  resumeSession,
  runtimeSessionIdForStored,
  selectSession,
  sessionState as rawSessionState,
  startNewSession,
  storedSessionIdForRuntime
} from '$lib/stores/session.svelte'
import { profileState } from '$lib/stores/profile.svelte'

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
