import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequestGateway } = vi.hoisted(() => ({
  mockRequestGateway: vi.fn()
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
  navigate: vi.fn(),
  sessionRoute: vi.fn((id: string) => `/${id}`),
  routerState: {}
}))

import { composerState, submitPrompt } from '$lib/stores/composer.svelte'
import { clearQueuedPrompts, getQueuedPrompts } from '$lib/stores/composer-queue'
import { messageState, threadForSession } from '$lib/stores/messages.svelte'
import { rememberRuntimeSession, sessionState } from '$lib/stores/session.svelte'

describe('composer runtime targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
