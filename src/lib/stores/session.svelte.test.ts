import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockRequestGateway, mockNavigate, mockSessionRoute } = vi.hoisted(() => ({
  mockRequestGateway: vi.fn(),
  mockNavigate: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`)
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  requestGateway: mockRequestGateway,
  gatewayState: {}
}))

vi.mock('../../app/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: {}
}))

import { createSession, resumeSession, sessionState as rawSessionState } from '$lib/stores/session.svelte'

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.storedSessionId = null
    rawSessionState.error = null
  })

  it('sets activeSessionId to short sid and storedSessionId to persistent key', async () => {
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

    // URL navigates to stored key (survives page refresh)
    expect(mockNavigate).toHaveBeenCalledWith('/' + storedKey)
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
    expect(mockNavigate).toHaveBeenCalledWith('/' + liveSid)
  })

  it('returns null on gateway error and sets error state', async () => {
    mockRequestGateway.mockRejectedValueOnce(new Error('gateway down'))

    const result = await createSession()

    expect(result).toBeNull()
    expect(rawSessionState.error).toBeTruthy()
    expect(rawSessionState.storedSessionId).toBeNull()
  })
})

describe('resumeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.storedSessionId = null
    rawSessionState.error = null
    rawSessionState.resumingSessionId = null
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

  it('returns null on gateway error and sets error state', async () => {
    mockRequestGateway.mockRejectedValueOnce(new Error('not found'))

    const result = await resumeSession('bad_id')

    expect(result).toBeNull()
    expect(rawSessionState.error).toBeTruthy()
    expect(rawSessionState.storedSessionId).toBeNull()
  })
})
