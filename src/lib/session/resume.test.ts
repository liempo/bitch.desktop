import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionMessages, mockNavigate, mockRequestGateway, mockSessionRoute } = vi.hoisted(() => ({
  mockGetSessionMessages: vi.fn(),
  mockNavigate: vi.fn(),
  mockRequestGateway: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`)
}))

vi.mock('$lib/api/dashboard', () => ({
  getSessionMessages: mockGetSessionMessages,
  listSessions: vi.fn(),
  searchSessions: vi.fn(),
  renameSession: vi.fn(),
  setSessionArchived: vi.fn(),
  deleteSession: vi.fn()
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  requestGateway: mockRequestGateway,
  gatewayState: { connectionState: 'open' }
}))

vi.mock('../app/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: {}
}))

import { resumeAndHydrateStoredSession } from '$lib/session/resume'
import {
  appendUserMessage,
  handleGatewayEvent,
  messageState,
  setThreadBusy,
  threadForSession
} from '$lib/stores/messages.svelte'
import { rememberRuntimeSession, sessionState } from '$lib/stores/session.svelte'
import type { SessionMessage } from '$lib/types/hermes'

function storedMessage(text: string): SessionMessage {
  return {
    content: text,
    role: 'user',
    text,
    timestamp: 123
  } as SessionMessage
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

describe('resumeAndHydrateStoredSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messageState.sessions = {}
    sessionState.activeSessionId = null
    sessionState.storedSessionId = null
    sessionState.error = null
    sessionState.resumingSessionId = null
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.storedSessionIdsByRuntimeId = {}
  })

  it('hydrates the stored snapshot before session.resume and keeps it over gateway resume messages', async () => {
    const order: string[] = []

    mockGetSessionMessages.mockImplementation(async (sessionId: string) => {
      order.push(`snapshot:${sessionId}`)
      return { session_id: sessionId, messages: [storedMessage('stored snapshot')] }
    })
    mockRequestGateway.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      order.push(`${method}:${params?.session_id}`)
      return {
        session_id: 'live-resume',
        resumed: 'stored-resume',
        message_count: 1,
        messages: [storedMessage('gateway resume projection')],
        info: { model: 'test-model' }
      }
    })

    await expect(resumeAndHydrateStoredSession('stored-resume')).resolves.toBe(true)

    expect(order).toEqual(['snapshot:stored-resume', 'session.resume:stored-resume'])
    expect(threadForSession('stored-resume')?.messages.map(message => message.text)).toEqual(['stored snapshot'])
    expect(sessionState.activeSessionId).toBe('live-resume')
    expect(sessionState.storedSessionId).toBe('stored-resume')
  })

  it('uses gateway resume messages only when no stored snapshot exists', async () => {
    mockGetSessionMessages.mockResolvedValueOnce({ session_id: 'stored-empty', messages: [] })
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-empty',
      resumed: 'stored-empty',
      message_count: 1,
      messages: [storedMessage('gateway fallback')],
      info: { model: 'test-model' }
    })

    await expect(resumeAndHydrateStoredSession('stored-empty')).resolves.toBe(true)

    expect(threadForSession('stored-empty')?.messages.map(message => message.text)).toEqual(['gateway fallback'])
  })

  it('does not resume or hydrate a stale route after another session is selected', async () => {
    const pendingSnapshot = deferred<{ messages: SessionMessage[]; session_id: string }>()
    mockGetSessionMessages.mockReturnValueOnce(pendingSnapshot.promise)

    const pending = resumeAndHydrateStoredSession('stored-A')
    sessionState.storedSessionId = 'stored-B'
    pendingSnapshot.resolve({ session_id: 'stored-A', messages: [storedMessage('stale snapshot')] })

    await expect(pending).resolves.toBe(false)
    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.resume', expect.anything())
    expect(threadForSession('stored-A')).toBeNull()
    expect(sessionState.storedSessionId).toBe('stored-B')
  })

  it('preserves an in-progress live thread when the stored snapshot is shorter', async () => {
    rememberRuntimeSession('stored-live', 'live-resume')
    appendUserMessage('stored-live', 'in-flight user')
    setThreadBusy('stored-live', true)
    handleGatewayEvent({
      session_id: 'live-resume',
      type: 'message.start',
      payload: {}
    })
    handleGatewayEvent({
      session_id: 'live-resume',
      type: 'message.delta',
      payload: { text: 'partial assistant' }
    })

    mockGetSessionMessages.mockResolvedValueOnce({
      session_id: 'stored-live',
      messages: [storedMessage('stored only')]
    })
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-resume',
      resumed: 'stored-live',
      message_count: 1,
      messages: [storedMessage('gateway resume projection')],
      info: { running: true }
    })

    await expect(resumeAndHydrateStoredSession('stored-live')).resolves.toBe(true)

    const thread = threadForSession('stored-live')
    expect(thread?.messages.map(message => message.text)).toEqual(['in-flight user', 'partial assistant'])
    expect(thread?.busy).toBe(true)
    expect(thread?.messages.some(message => message.pending)).toBe(true)
  })

  it('refreshes from the stored snapshot when the thread is idle and not ahead of history', async () => {
    appendUserMessage('stored-idle', 'old local copy')
    setThreadBusy('stored-idle', false)

    mockGetSessionMessages.mockResolvedValueOnce({
      session_id: 'stored-idle',
      messages: [storedMessage('stored only'), storedMessage('newer stored turn')]
    })
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-idle',
      resumed: 'stored-idle',
      message_count: 2,
      messages: [storedMessage('gateway resume projection')],
      info: { running: false }
    })

    await expect(resumeAndHydrateStoredSession('stored-idle')).resolves.toBe(true)

    expect(threadForSession('stored-idle')?.messages.map(message => message.text)).toEqual([
      'stored only',
      'newer stored turn'
    ])
    expect(threadForSession('stored-idle')?.busy).toBe(false)
  })

  it('syncs local busy state from session.resume info even when snapshot hydration is skipped', async () => {
    appendUserMessage('stored-running', 'still streaming')
    setThreadBusy('stored-running', false)
    handleGatewayEvent({
      session_id: 'live-running',
      type: 'message.start',
      payload: {}
    })

    mockGetSessionMessages.mockResolvedValueOnce({
      session_id: 'stored-running',
      messages: [storedMessage('stored only')]
    })
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-running',
      resumed: 'stored-running',
      message_count: 1,
      messages: [],
      info: { running: true }
    })

    await expect(resumeAndHydrateStoredSession('stored-running')).resolves.toBe(true)

    expect(threadForSession('stored-running')?.busy).toBe(true)
  })
})
