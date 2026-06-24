import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionMessages, mockNavigate, mockRequestGateway, mockSessionRoute, mockEnsureGatewayForProfile } =
  vi.hoisted(() => ({
    mockGetSessionMessages: vi.fn(),
    mockNavigate: vi.fn(),
    mockRequestGateway: vi.fn(),
    mockSessionRoute: vi.fn((id: string) => `/${id}`),
    mockEnsureGatewayForProfile: vi.fn()
  }))

vi.mock('$lib/hermes/dashboard', () => ({
  getSessionMessages: mockGetSessionMessages,
  listSessions: vi.fn(),
  searchSessions: vi.fn(),
  renameSession: vi.fn(),
  setSessionArchived: vi.fn(),
  deleteSession: vi.fn(),
  setApiRequestProfile: vi.fn()
}))

vi.mock('$lib/hermes/gateway', () => ({
  requestGateway: mockRequestGateway,
  ensureGatewayForProfile: mockEnsureGatewayForProfile,
  gatewayState: { connectionState: 'open' }
}))

vi.mock('@/app/agent/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: {}
}))

import { resumeAndHydrateStoredSession } from '$lib/hermes/sessions'
import {
  appendUserMessage,
  handleGatewayEvent,
  messageState,
  setConversationBusy,
  conversationForSession
} from '$lib/hermes/conversations'
import {
  rememberRuntimeSession,
  runtimeSessionIdForStored,
  sessionState,
  beginResumeSession
} from '$lib/hermes/sessions'
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
    sessionState.resumeExhaustedSessionId = null
    sessionState.resumeFailedSessionId = null
    sessionState.resumingSessionId = null
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.sessionLineageIdsByRootId = {}
    sessionState.sessionProfilesById = {}
    sessionState.sessionStartedAtById = {}
    sessionState.sessionLineageIdsById = {}
    sessionState.storedSessionIdsByRuntimeId = {}
  })

  it('shows a loading state while a stored session is being resumed', async () => {
    const pendingSnapshot = deferred<{ messages: SessionMessage[]; session_id: string }>()
    mockGetSessionMessages.mockReturnValueOnce(pendingSnapshot.promise)

    const pending = resumeAndHydrateStoredSession('stored-loading')
    expect(conversationForSession('stored-loading')?.loading).toBe(true)
    expect(sessionState.resumingSessionId).toBe('stored-loading')

    pendingSnapshot.resolve({
      session_id: 'stored-loading',
      messages: [storedMessage('stored snapshot')]
    })
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-loading',
      resumed: 'stored-loading',
      message_count: 1,
      messages: [],
      info: { running: false }
    })

    await expect(pending).resolves.toBe(true)
    expect(conversationForSession('stored-loading')?.loading).toBe(false)
    expect(sessionState.resumingSessionId).toBeNull()
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
    expect(conversationForSession('stored-resume')?.messages.map(message => message.text)).toEqual(['stored snapshot'])
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

    expect(conversationForSession('stored-empty')?.messages.map(message => message.text)).toEqual(['gateway fallback'])
  })

  it('hydrates compressed session history from every known lineage segment', async () => {
    sessionState.sessionLineageIdsByRootId = {
      'stored-root': ['stored-root', 'stored-middle', 'stored-tip']
    }
    sessionState.sessionProfilesById = {
      'stored-root': 'default',
      'stored-middle': 'default',
      'stored-tip': 'default'
    }
    sessionState.sessionLineageIdsById = {
      'stored-root': 'stored-root',
      'stored-middle': 'stored-root',
      'stored-tip': 'stored-root'
    }
    mockGetSessionMessages.mockImplementation(async (sessionId: string) => ({
      session_id: sessionId,
      messages: [storedMessage(`${sessionId} message`)]
    }))
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-tip',
      resumed: 'stored-tip',
      message_count: 3,
      messages: [storedMessage('gateway compression projection')],
      info: { model: 'test-model' }
    })

    await expect(resumeAndHydrateStoredSession('stored-tip')).resolves.toBe(true)

    expect(mockGetSessionMessages).toHaveBeenCalledTimes(3)
    expect(mockGetSessionMessages.mock.calls.map(call => call[0])).toEqual([
      'stored-root',
      'stored-middle',
      'stored-tip'
    ])
    expect(conversationForSession('stored-tip')?.messages.map(message => message.text)).toEqual([
      'stored-root message',
      'stored-middle message',
      'stored-tip message'
    ])
  })

  it('does not resume or hydrate a stale route after another session is selected', async () => {
    const pendingSnapshot = deferred<{ messages: SessionMessage[]; session_id: string }>()
    mockGetSessionMessages.mockReturnValueOnce(pendingSnapshot.promise)

    const pending = resumeAndHydrateStoredSession('stored-A')
    beginResumeSession('stored-B')
    pendingSnapshot.resolve({ session_id: 'stored-A', messages: [storedMessage('stale snapshot')] })

    await expect(pending).resolves.toBe(false)
    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.resume', expect.anything())
    expect(conversationForSession('stored-A')).toBeNull()
    expect(sessionState.storedSessionId).toBe('stored-B')
  })

  it('preserves an in-progress live conversation when the stored snapshot is shorter', async () => {
    rememberRuntimeSession('stored-live', 'live-resume')
    appendUserMessage('stored-live', 'in-flight user')
    setConversationBusy('stored-live', true)
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

    const conversation = conversationForSession('stored-live')
    expect(conversation?.messages.map(message => message.text)).toEqual(['in-flight user', 'partial assistant'])
    expect(conversation?.busy).toBe(true)
    expect(conversation?.messages.some(message => message.pending)).toBe(true)
  })

  it('refreshes from the stored snapshot when the conversation is idle and not ahead of history', async () => {
    appendUserMessage('stored-idle', 'old local copy')
    setConversationBusy('stored-idle', false)

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

    expect(conversationForSession('stored-idle')?.messages.map(message => message.text)).toEqual([
      'stored only',
      'newer stored turn'
    ])
    expect(conversationForSession('stored-idle')?.busy).toBe(false)
  })

  it('preserves an optimistic first message when resume returns an empty projection', async () => {
    rememberRuntimeSession('stored-fresh', 'live-fresh')
    appendUserMessage('stored-fresh', 'first message')
    setConversationBusy('stored-fresh', true)

    mockGetSessionMessages.mockResolvedValueOnce({ session_id: 'stored-fresh', messages: [] })
    await expect(resumeAndHydrateStoredSession('stored-fresh')).resolves.toBe(true)

    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.info', expect.anything())
    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.resume', expect.anything())
    expect(conversationForSession('stored-fresh')?.messages.map(message => message.text)).toEqual(['first message'])
  })

  it('marks a resume failure when no stored snapshot can paint the conversation', async () => {
    mockGetSessionMessages.mockResolvedValueOnce({ session_id: 'stored-empty-fail', messages: [] })
    mockRequestGateway.mockRejectedValueOnce(new Error('gateway restarting'))

    await expect(resumeAndHydrateStoredSession('stored-empty-fail')).resolves.toBe(false)

    expect(sessionState.resumeFailedSessionId).toBe('stored-empty-fail')
    expect(sessionState.resumingSessionId).toBeNull()
    expect(conversationForSession('stored-empty-fail')?.loading).not.toBe(true)
  })

  it('does not mark resume failure when stored history was painted', async () => {
    mockGetSessionMessages.mockResolvedValueOnce({
      session_id: 'stored-history-fail',
      messages: [storedMessage('stored history survives')]
    })
    mockRequestGateway.mockRejectedValueOnce(new Error('gateway restarting'))

    await expect(resumeAndHydrateStoredSession('stored-history-fail')).resolves.toBe(false)

    expect(sessionState.resumeFailedSessionId).toBeNull()
    expect(conversationForSession('stored-history-fail')?.messages.map(message => message.text)).toEqual([
      'stored history survives'
    ])
  })

  it('does not resume over an optimistic busy fresh session before stored history exists', async () => {
    rememberRuntimeSession('stored-goal', 'live-goal')
    appendUserMessage('stored-goal', 'build a rocket')
    setConversationBusy('stored-goal', true)

    mockGetSessionMessages.mockRejectedValueOnce(
      new Error('dashboard request returned 404 Not Found: {"detail":"Session not found"}')
    )
    await expect(resumeAndHydrateStoredSession('stored-goal')).resolves.toBe(true)

    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.info', expect.anything())
    expect(mockRequestGateway).not.toHaveBeenCalledWith('session.resume', expect.anything())
    expect(runtimeSessionIdForStored('stored-goal')).toBe('live-goal')
    expect(sessionState.activeSessionId).toBe('live-goal')
    expect(sessionState.error).toBeNull()
    expect(conversationForSession('stored-goal')?.busy).toBe(true)

    handleGatewayEvent({
      session_id: 'live-goal',
      type: 'message.start',
      payload: {}
    })
    handleGatewayEvent({
      session_id: 'live-goal',
      type: 'thinking.delta',
      payload: { text: 'thinking survives' }
    })

    expect(conversationForSession('stored-goal')?.messages.at(-1)?.reasoning).toEqual(['thinking survives'])
    expect(messageState.sessions['live-goal']).toBeUndefined()
  })

  it('does not surface a stored-history 404 when the session has not been persisted yet', async () => {
    mockGetSessionMessages.mockRejectedValueOnce(
      new Error('dashboard request returned 404 Not Found: {"detail":"Session not found"}')
    )
    mockRequestGateway.mockResolvedValueOnce({
      session_id: 'live-fresh',
      resumed: 'stored-fresh',
      message_count: 0,
      messages: [],
      info: { running: false }
    })

    await expect(resumeAndHydrateStoredSession('stored-fresh')).resolves.toBe(true)

    expect(sessionState.error).toBeNull()
  })

  it('syncs local busy state from session.resume info even when snapshot hydration is skipped', async () => {
    appendUserMessage('stored-running', 'still streaming')
    setConversationBusy('stored-running', false)
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

    expect(conversationForSession('stored-running')?.busy).toBe(true)
  })
})
