import { describe, expect, it, vi, beforeEach } from 'vitest'

// vi.mock calls are hoisted — the factory functions run before module
// imports.  Use vi.hoisted() so mock state is available at hoist time.
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

// All mocks are set up via vi.hoisted above.

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset reactive state
    rawSessionState.activeSessionId = null
    rawSessionState.error = null
  })

  it('uses response.session_id for the active session (not stored_session_id)', async () => {
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

    expect(result).toBe(liveSid)
    expect(result).not.toBe(storedKey)
    expect(rawSessionState.activeSessionId).toBe(liveSid)
    expect(rawSessionState.activeSessionId).not.toBe(storedKey)

    // Verify the right method was called
    expect(mockRequestGateway).toHaveBeenCalledWith(
      'session.create',
      expect.objectContaining({ cols: expect.any(Number) })
    )
  })

  it('falls back to session_id when stored_session_id is absent', async () => {
    // session.create always returns session_id; stored_session_id is absent
    // only in older gateway versions.  Our code now prefers session_id
    // regardless, so absence of stored_session_id is a no-op.
    const liveSid = 'deadbeef'

    mockRequestGateway.mockResolvedValueOnce({
      session_id: liveSid,
      stored_session_id: undefined,
      message_count: 0,
      messages: [],
      info: { model: 'test-model' }
    })

    const result = await createSession()

    expect(result).toBe(liveSid)
    expect(rawSessionState.activeSessionId).toBe(liveSid)
  })

  it('returns null on gateway error', async () => {
    mockRequestGateway.mockRejectedValueOnce(new Error('gateway down'))

    const result = await createSession()

    expect(result).toBeNull()
    expect(rawSessionState.error).toBeTruthy()
  })
})

describe('resumeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawSessionState.activeSessionId = null
    rawSessionState.error = null
    rawSessionState.resumingSessionId = null
  })

  it('sets activeSessionId to response.session_id (not the param)', async () => {
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

    // The gateway call should pass the stored key (the param)
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
  })
})
