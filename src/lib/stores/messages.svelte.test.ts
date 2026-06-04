import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionMessages } = vi.hoisted(() => ({
  mockGetSessionMessages: vi.fn()
}))

vi.mock('$lib/dashboard-api', () => ({
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
})
