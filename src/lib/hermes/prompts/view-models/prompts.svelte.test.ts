import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnsureGatewayForProfile, mockRequestGateway } = vi.hoisted(() => ({
  mockEnsureGatewayForProfile: vi.fn(),
  mockRequestGateway: vi.fn()
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  ensureGatewayForProfile: mockEnsureGatewayForProfile,
  requestGateway: mockRequestGateway
}))

vi.mock('@/app/agent/router.svelte', () => ({
  navigate: vi.fn(),
  routerState: {},
  sessionRoute: vi.fn((id: string) => `/${id}`)
}))

import {
  clearAllPrompts,
  clearClarifyRequest,
  promptsState,
  respondToApproval,
  respondToClarify,
  respondToSecret,
  respondToSudo,
  setApprovalRequest,
  setClarifyRequest,
  setSecretRequest,
  setSudoRequest
} from '$lib/hermes/prompts'
import { rememberRuntimeSession, sessionState } from '$lib/stores/session.svelte'
import { profileState } from '$lib/hermes/profiles'

function resetPrompts(): void {
  promptsState.clarifyRequests = {}
  promptsState.approvalRequest = null
  promptsState.sudoRequest = null
  promptsState.secretRequest = null
  promptsState.error = null
  promptsState.submitting = null
}

function resetSession(): void {
  sessionState.activeSessionId = null
  sessionState.storedSessionId = null
  sessionState.runtimeIdsByStoredSessionId = {}
  sessionState.storedSessionIdsByRuntimeId = {}
}

describe('prompt request store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureGatewayForProfile.mockResolvedValue(undefined)
    resetPrompts()
    resetSession()
  })

  it('parks clarify requests by stored session so background chats can be answered later', () => {
    setClarifyRequest({
      choices: ['alpha', 'beta'],
      question: 'Choose one',
      requestId: 'clarify-1',
      sessionId: 'stored-A'
    })
    setClarifyRequest({
      choices: null,
      question: 'Explain',
      requestId: 'clarify-2',
      sessionId: 'stored-B'
    })

    expect(promptsState.clarifyRequests['stored-A']?.requestId).toBe('clarify-1')
    expect(promptsState.clarifyRequests['stored-B']?.question).toBe('Explain')

    clearClarifyRequest('clarify-1', 'stored-A')

    expect(promptsState.clarifyRequests['stored-A']).toBeUndefined()
    expect(promptsState.clarifyRequests['stored-B']?.requestId).toBe('clarify-2')
  })

  it('responds to clarify.request and clears only the answered request', async () => {
    mockRequestGateway.mockResolvedValueOnce({ ok: true })
    setClarifyRequest({
      choices: ['yes', 'no'],
      question: 'Proceed?',
      requestId: 'clarify-1',
      sessionId: 'stored-A'
    })

    await expect(respondToClarify('stored-A', 'yes')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('clarify.respond', {
      request_id: 'clarify-1',
      answer: 'yes',
      profile: 'default'
    })
    expect(promptsState.clarifyRequests['stored-A']).toBeUndefined()
    expect(promptsState.error).toBeNull()
  })

  it('responds to approval.request with the cached live runtime session id', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockResolvedValueOnce({ resolved: true })
    setApprovalRequest({
      command: 'rm -rf /tmp/demo',
      description: 'destructive terminal command',
      sessionId: 'stored-A'
    })

    await expect(respondToApproval('once')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('approval.respond', {
      choice: 'once',
      session_id: 'live-A',
      profile: 'default'
    })
    expect(promptsState.approvalRequest).toBeNull()
  })

  it('refuses prompt responses when the owning profile cannot be resolved', async () => {
    profileState.showAllProfiles = true
    mockRequestGateway.mockResolvedValue({ ok: true })
    setSecretRequest({ envVar: 'TOKEN', prompt: 'Token', requestId: 'secret-1', sessionId: 'stored-A' })

    await expect(respondToSecret('secret-value')).resolves.toBe(false)

    expect(mockRequestGateway).not.toHaveBeenCalled()
    expect(promptsState.error).toContain('known profile')
    expect(promptsState.secretRequest?.requestId).toBe('secret-1')
  })

  it('responds to sudo and secret request ids then clears modal state', async () => {
    mockRequestGateway.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true })
    setSudoRequest({ profile: 'default', requestId: 'sudo-1' })
    setSecretRequest({ envVar: 'API_TOKEN', prompt: 'Enter API token', profile: 'default', requestId: 'secret-1' })

    await expect(respondToSudo('hunter2')).resolves.toBe(true)
    await expect(respondToSecret('secret-value')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenNthCalledWith(1, 'sudo.respond', {
      request_id: 'sudo-1',
      password: 'hunter2',
      profile: 'default'
    })
    expect(mockRequestGateway).toHaveBeenNthCalledWith(2, 'secret.respond', {
      request_id: 'secret-1',
      value: 'secret-value',
      profile: 'default'
    })
    expect(promptsState.sudoRequest).toBeNull()
    expect(promptsState.secretRequest).toBeNull()
  })

  it('clears all blocking prompts at turn completion', () => {
    setClarifyRequest({ choices: null, question: 'Q', requestId: 'clarify-1', sessionId: 'stored-A' })
    setApprovalRequest({ command: 'cmd', description: 'desc', sessionId: 'stored-A' })
    setSudoRequest({ requestId: 'sudo-1' })
    setSecretRequest({ envVar: 'TOKEN', prompt: 'Token', requestId: 'secret-1' })

    clearAllPrompts()

    expect(promptsState.clarifyRequests).toEqual({})
    expect(promptsState.approvalRequest).toBeNull()
    expect(promptsState.sudoRequest).toBeNull()
    expect(promptsState.secretRequest).toBeNull()
  })
})
