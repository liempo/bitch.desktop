import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionMessages } = vi.hoisted(() => ({
  mockGetSessionMessages: vi.fn()
}))

vi.mock('$lib/api/dashboard', () => ({
  getSessionMessages: mockGetSessionMessages
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  getGateway: vi.fn(() => ({ on: vi.fn(() => vi.fn()) }))
}))

import {
  appendUserMessage,
  handleGatewayEvent,
  hydrateSessionMessagesFromGateway,
  messageState,
  threadForSession
} from '$lib/stores/messages.svelte'
import {
  promptsState,
  setApprovalRequest,
  setClarifyRequest,
  setSecretRequest,
  setSudoRequest
} from '$lib/stores/prompts.svelte'
import { rememberRuntimeSession, sessionState } from '$lib/stores/session.svelte'
import type { SessionMessage } from '$lib/types/hermes'

const storedKey = 'stored-session-key'
const liveSid = 'abcd1234'

function resetState(): void {
  messageState.sessions = {}
  sessionState.activeSessionId = null
  sessionState.storedSessionId = null
  sessionState.workingSessionIds = []
  sessionState.needsInputSessionIds = []
  sessionState.runtimeIdsByStoredSessionId = {}
  sessionState.storedSessionIdsByRuntimeId = {}
  promptsState.clarifyRequests = {}
  promptsState.approvalRequest = null
  promptsState.sudoRequest = null
  promptsState.secretRequest = null
  promptsState.error = null
  promptsState.submitting = null
}

function storedMessage(text: string): SessionMessage {
  return {
    content: text,
    role: 'user',
    text,
    timestamp: 123
  } as SessionMessage
}

describe('message session id mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetState()
  })

  it('hydrates resumed history under the stored route key when the caller passes the live sid', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    hydrateSessionMessagesFromGateway(liveSid, [storedMessage('visible history')])

    expect(threadForSession(storedKey)?.messages.map(message => message.text)).toEqual(['visible history'])
    expect(threadForSession(liveSid)).toBe(threadForSession(storedKey))
  })

  it('applies live gateway stream events to the stored visible thread', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    handleGatewayEvent({
      session_id: liveSid,
      type: 'message.start',
      payload: {}
    })
    handleGatewayEvent({
      session_id: liveSid,
      type: 'message.delta',
      payload: { text: 'streamed answer' }
    })

    const thread = threadForSession(storedKey)
    expect(thread?.messages).toHaveLength(1)
    expect(thread?.messages[0]?.text).toBe('streamed answer')
    expect(sessionState.workingSessionIds).toContain(storedKey)
    expect(sessionState.workingSessionIds).not.toContain(liveSid)
  })

  it('maps background runtime events through the stored-runtime cache, not just the active pair', () => {
    sessionState.activeSessionId = 'current-live'
    sessionState.storedSessionId = 'current-stored'
    rememberRuntimeSession('background-stored', 'background-live')

    handleGatewayEvent({
      session_id: 'background-live',
      type: 'message.start',
      payload: {}
    })
    handleGatewayEvent({
      session_id: 'background-live',
      type: 'message.delta',
      payload: { text: 'background output' }
    })

    expect(threadForSession('background-stored')?.messages.map(message => message.text)).toEqual(['background output'])
    expect(messageState.sessions['background-live']).toBeUndefined()
    expect(sessionState.workingSessionIds).toContain('background-stored')
    expect(sessionState.workingSessionIds).not.toContain('background-live')
  })

  it('renders optimistic user messages in the stored visible thread even when submit uses the live sid', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    appendUserMessage(liveSid, 'operator payload')

    expect(threadForSession(storedKey)?.messages.map(message => message.text)).toEqual(['operator payload'])
    expect(Object.keys(messageState.sessions)).toEqual([storedKey])
  })

  it('stores interactive prompt events under the visible stored session key', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { choices: ['red', 'blue'], question: 'Pick a color', request_id: 'clarify-1' },
      session_id: liveSid,
      type: 'clarify.request'
    })
    handleGatewayEvent({
      payload: { command: 'rm demo', description: 'dangerous command' },
      session_id: liveSid,
      type: 'approval.request'
    })
    handleGatewayEvent({
      payload: { request_id: 'sudo-1' },
      session_id: liveSid,
      type: 'sudo.request'
    })
    handleGatewayEvent({
      payload: { env_var: 'TOKEN', prompt: 'Enter token', request_id: 'secret-1' },
      session_id: liveSid,
      type: 'secret.request'
    })

    expect(promptsState.clarifyRequests[storedKey]).toMatchObject({
      choices: ['red', 'blue'],
      question: 'Pick a color',
      requestId: 'clarify-1',
      sessionId: storedKey
    })
    expect(promptsState.approvalRequest).toMatchObject({
      command: 'rm demo',
      description: 'dangerous command',
      sessionId: storedKey
    })
    expect(promptsState.sudoRequest).toEqual({ requestId: 'sudo-1' })
    expect(promptsState.secretRequest).toEqual({ envVar: 'TOKEN', prompt: 'Enter token', requestId: 'secret-1' })
    expect(sessionState.needsInputSessionIds).toContain(storedKey)
  })

  it('keeps gateway tool context on running rows and preserves it after completion', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { context: 'npm run test', name: 'terminal', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.start'
    })

    const runningTool = threadForSession(storedKey)?.messages[0]?.tools[0]
    expect(runningTool).toMatchObject({
      context: 'npm run test',
      id: 'tool-1',
      name: 'terminal',
      status: 'running',
      summary: 'Running…'
    })

    handleGatewayEvent({
      payload: { name: 'terminal', output: 'tests passed', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    expect(threadForSession(storedKey)?.messages[0]?.tools[0]).toMatchObject({
      context: 'npm run test',
      output: 'tests passed',
      status: 'complete'
    })
  })

  it('clears blocking prompts when a turn completes or errors', () => {
    setClarifyRequest({ choices: null, question: 'Q', requestId: 'clarify-1', sessionId: storedKey })
    setApprovalRequest({ command: 'cmd', description: 'desc', sessionId: storedKey })
    setSudoRequest({ requestId: 'sudo-1' })
    setSecretRequest({ envVar: 'TOKEN', prompt: 'Token', requestId: 'secret-1' })
    sessionState.needsInputSessionIds = [storedKey]

    handleGatewayEvent({ payload: { text: 'done' }, session_id: storedKey, type: 'message.complete' })

    expect(promptsState.clarifyRequests).toEqual({})
    expect(promptsState.approvalRequest).toBeNull()
    expect(promptsState.sudoRequest).toBeNull()
    expect(promptsState.secretRequest).toBeNull()
    expect(sessionState.needsInputSessionIds).not.toContain(storedKey)

    setClarifyRequest({ choices: null, question: 'Q', requestId: 'clarify-2', sessionId: storedKey })
    setApprovalRequest({ command: 'cmd', description: 'desc', sessionId: storedKey })
    setSudoRequest({ requestId: 'sudo-2' })
    setSecretRequest({ envVar: 'TOKEN', prompt: 'Token', requestId: 'secret-2' })
    sessionState.needsInputSessionIds = [storedKey]

    handleGatewayEvent({ payload: { message: 'boom' }, session_id: storedKey, type: 'error' })

    expect(promptsState.clarifyRequests).toEqual({})
    expect(promptsState.approvalRequest).toBeNull()
    expect(promptsState.sudoRequest).toBeNull()
    expect(promptsState.secretRequest).toBeNull()
    expect(sessionState.needsInputSessionIds).not.toContain(storedKey)
  })
})
