import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

import {
  deleteSession,
  getSessionMessages,
  renameSession,
  SESSION_MESSAGES_LOAD_DELAY_MS,
  setSessionArchived
} from '$lib/hermes/dashboard'
import type { SessionMessagesResponse } from '$lib/types/hermes'

describe('getSessionMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockInvoke.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps successful session message loads pending for the artificial delay', async () => {
    const response: SessionMessagesResponse = { messages: [], session_id: 'stored-session' }
    const resolved = vi.fn()

    mockInvoke.mockResolvedValueOnce(response)

    const pending = getSessionMessages('stored-session')
    pending.then(resolved)

    await vi.advanceTimersByTimeAsync(SESSION_MESSAGES_LOAD_DELAY_MS - 1)

    expect(resolved).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(pending).resolves.toBe(response)
    expect(resolved).toHaveBeenCalledWith(response)
  })

  it('keeps failed session message loads pending for the artificial delay', async () => {
    const error = new Error('transcript unavailable')
    const rejected = vi.fn()

    mockInvoke.mockRejectedValueOnce(error)

    const pending = getSessionMessages('stored-session')
    pending.catch(rejected)

    await vi.advanceTimersByTimeAsync(SESSION_MESSAGES_LOAD_DELAY_MS - 1)

    expect(rejected).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(pending).rejects.toThrow(error)
    expect(rejected).toHaveBeenCalledWith(error)
  })
})

describe('session mutations', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('forwards profile in the rename session URL and body', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true, title: 'renamed' })

    await expect(renameSession('stored session', 'renamed', 'crypto/profile')).resolves.toEqual({
      ok: true,
      title: 'renamed'
    })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: { profile: 'crypto/profile', title: 'renamed' },
        method: 'PATCH',
        path: '/api/sessions/stored%20session?profile=crypto%2Fprofile',
        profile: 'crypto/profile'
      }
    })
  })

  it('forwards profile in the archive session URL and body', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true })

    await expect(setSessionArchived('stored session', true, 'crypto/profile')).resolves.toEqual({ ok: true })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: { archived: true, profile: 'crypto/profile' },
        method: 'PATCH',
        path: '/api/sessions/stored%20session?profile=crypto%2Fprofile',
        profile: 'crypto/profile'
      }
    })
  })

  it('forwards profile in the delete session URL', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true })

    await expect(deleteSession('stored session', 'crypto/profile')).resolves.toEqual({ ok: true })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: undefined,
        method: 'DELETE',
        path: '/api/sessions/stored%20session?profile=crypto%2Fprofile',
        profile: 'crypto/profile'
      }
    })
  })
})
