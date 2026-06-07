import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequestGateway, mockNavigate, mockSessionRoute, mockRouterState } = vi.hoisted(() => ({
  mockRequestGateway: vi.fn(),
  mockNavigate: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`),
  mockRouterState: { route: 'new' as 'new' | 'session', sessionId: null as string | null }
}))

vi.mock('$lib/api/dashboard', () => ({
  getGlobalModelInfo: vi.fn(),
  getModelOptions: vi.fn(),
  listSessions: vi.fn()
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  gatewayState: { connectionState: 'closed' },
  requestGateway: mockRequestGateway
}))

vi.mock('../../app/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: mockRouterState
}))

import { composerState, submitPrompt } from '$lib/stores/composer.svelte'
import { clearQueuedPrompts, getQueuedPrompts } from '$lib/stores/composer-queue'
import { messageState, threadForSession } from '$lib/stores/messages.svelte'
import { rememberRuntimeSession, sessionState } from '$lib/stores/session.svelte'

describe('composer runtime targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouterState.route = 'session'
    mockRouterState.sessionId = 'other-stored'
    composerState.sessions = {}
    messageState.sessions = {}
    sessionState.activeSessionId = 'other-live'
    sessionState.storedSessionId = 'other-stored'
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.storedSessionIdsByRuntimeId = {}
  })

  it('sends prompt.submit to the cached live runtime while keeping UI messages under the stored key', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockResolvedValueOnce({ ok: true })

    await expect(submitPrompt('stored-A', { text: 'hello cached runtime' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      session_id: 'live-A',
      text: 'hello cached runtime'
    })
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual(['hello cached runtime'])
    expect(messageState.sessions['live-A']).toBeUndefined()
  })

  it('creates a session on first submit from the new-chat route and navigates afterward', async () => {
    mockRouterState.route = 'new'
    mockRouterState.sessionId = null
    sessionState.activeSessionId = null
    sessionState.storedSessionId = null

    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'session.create') {
        return Promise.resolve({
          session_id: 'live-new',
          stored_session_id: 'stored-new',
          message_count: 0,
          messages: [],
          info: { model: 'test-model' }
        })
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt(null, { text: 'first message' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('session.create', expect.anything())
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      session_id: 'live-new',
      text: 'first message'
    })
    expect(mockNavigate).toHaveBeenCalledWith('/stored-new')
    expect(threadForSession('stored-new')?.messages.map(message => message.text)).toEqual(['first message'])
  })
})

describe('composer session busy recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    composerState.sessions = {}
    messageState.sessions = {}
    clearQueuedPrompts('stored-A')
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.storedSessionIdsByRuntimeId = {}
    rememberRuntimeSession('stored-A', 'live-A')
  })

  it('re-sets busy and enqueues the draft when prompt.submit reports session busy', async () => {
    mockRequestGateway.mockRejectedValueOnce(new Error('session busy'))

    await expect(submitPrompt('stored-A', { text: 'retry me later' })).resolves.toBe(true)

    expect(threadForSession('stored-A')?.busy).toBe(true)
    expect(threadForSession('stored-A')?.messages).toHaveLength(0)
    expect(getQueuedPrompts('stored-A')).toEqual([expect.objectContaining({ text: 'retry me later' })])
    expect(composerState.sessions['stored-A']?.error).toBeNull()
  })
})
