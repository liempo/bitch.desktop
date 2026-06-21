import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionMessages, mockSendMacosNotification } = vi.hoisted(() => ({
  mockGetSessionMessages: vi.fn(),
  mockSendMacosNotification: vi.fn()
}))

vi.mock('$lib/notifications/macos', () => ({
  buildAssistantCompleteNotification: ({ error, text }: { error?: string | null; text?: string | null }) => ({
    title: error ? 'BITCH needs attention' : 'BITCH finished',
    body: error || text || 'Agent response completed.'
  }),
  buildInputNeededNotification: (text: string | null | undefined) => ({
    title: 'BITCH needs input',
    body: text || 'The agent is waiting for your response.'
  }),
  sendMacosNotification: mockSendMacosNotification
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
  setThreadBusy,
  threadForSession
} from '$lib/stores/messages.svelte'
import { sessionMessagesLoaded, shouldShowSessionSidebarLoader } from '$lib/hermes/sessions'
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
  sessionState.sessionLineageIdsByThreadId = {}
  sessionState.sessionStartedAtById = {}
  sessionState.sessionThreadIdsById = {}
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

  it('only shows the sidebar loader for resume-only sessions until messages have loaded', () => {
    sessionState.resumingSessionId = storedKey

    expect(sessionMessagesLoaded(storedKey)).toBe(false)
    expect(shouldShowSessionSidebarLoader(storedKey)).toBe(true)

    hydrateSessionMessagesFromGateway(storedKey, [])

    expect(sessionMessagesLoaded(storedKey)).toBe(true)
    expect(shouldShowSessionSidebarLoader(storedKey)).toBe(false)
  })

  it('keeps the sidebar loader for hydrated sessions that are still busy', () => {
    hydrateSessionMessagesFromGateway(storedKey, [])
    sessionState.resumingSessionId = storedKey
    setThreadBusy(storedKey, true)

    expect(sessionMessagesLoaded(storedKey)).toBe(true)
    expect(shouldShowSessionSidebarLoader(storedKey)).toBe(true)
  })

  it('preserves optimistic user image and PDF attachments on the visible thread message', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    appendUserMessage(liveSid, 'inspect these', [
      {
        dataUrl: 'data:image/png;base64,aW1hZ2U=',
        id: 'image-1',
        kind: 'image',
        label: 'screen.png',
        mediaType: 'image/png',
        previewUrl: 'data:image/png;base64,aW1hZ2U=',
        size: 5
      },
      {
        detail: 'PDF · 8 B',
        id: 'pdf-1',
        kind: 'pdf',
        label: 'brief.pdf',
        mediaType: 'application/pdf',
        size: 8
      }
    ])

    const message = threadForSession(storedKey)?.messages[0]
    expect(message?.text).toBe('inspect these\n\nAttached files:\n- screen.png (5 B)\n- brief.pdf (PDF · 8 B)')
    expect(message?.attachments).toEqual([
      expect.objectContaining({
        id: 'image-1',
        kind: 'image',
        label: 'screen.png',
        previewUrl: 'data:image/png;base64,aW1hZ2U='
      }),
      expect.objectContaining({ id: 'pdf-1', kind: 'pdf', label: 'brief.pdf' })
    ])
  })

  it('extracts persisted user image_url and @image references into thread attachments', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey
    const dataUrl = 'data:image/png;base64,aW1hZ2U='
    const gatewayPath = '/opt/data/.hermes/images/screen.webp'

    hydrateSessionMessagesFromGateway(liveSid, [
      {
        content: [
          { text: 'look at this ', type: 'text' },
          { image_url: { url: dataUrl }, type: 'image_url' }
        ],
        role: 'user',
        timestamp: 100
      } as unknown as SessionMessage,
      {
        content: `stored preview @image:${gatewayPath}`,
        role: 'user',
        timestamp: 101
      } as SessionMessage
    ])

    const messages = threadForSession(storedKey)?.messages ?? []
    expect(messages[0]?.text).toBe('look at this')
    expect(messages[0]?.attachments?.[0]).toMatchObject({
      dataUrl,
      kind: 'image',
      label: 'image',
      mediaType: 'image/png'
    })
    expect(messages[1]?.text).toBe('stored preview')
    expect(messages[1]?.attachments?.[0]).toMatchObject({
      kind: 'image',
      label: 'screen.webp',
      path: gatewayPath
    })
  })

  it('keeps assistant MEDIA references in text for inline remote rendering', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    hydrateSessionMessagesFromGateway(liveSid, [
      {
        content: 'rendered output\nMEDIA:/opt/data/neon-render.png',
        role: 'assistant',
        timestamp: 102
      } as SessionMessage,
      {
        content: 'artifact: MEDIA:/opt/data/wiki/personal/notes.pdf',
        role: 'assistant',
        timestamp: 103
      } as SessionMessage
    ])

    const messages = threadForSession(storedKey)?.messages ?? []
    expect(messages[0]?.text).toBe('rendered output\nMEDIA:/opt/data/neon-render.png')
    expect(messages[0]?.attachments).toBeUndefined()
    expect(messages[1]?.text).toBe('artifact: MEDIA:/opt/data/wiki/personal/notes.pdf')
    expect(messages[1]?.attachments).toBeUndefined()
  })

  it('keeps standalone absolute paths as text instead of visible attachments', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    hydrateSessionMessagesFromGateway(liveSid, [
      {
        content: 'rendered output\n/opt/data/.hermes/cache/render 1.png',
        role: 'assistant',
        timestamp: 104
      } as SessionMessage,
      {
        content: 'artifact ready\n`/opt/data/wiki/personal/notes.pdf`',
        role: 'assistant',
        timestamp: 105
      } as SessionMessage,
      {
        content: 'also linkable\n/opt/data/wiki/personal/readme.txt',
        role: 'assistant',
        timestamp: 106
      } as SessionMessage
    ])

    const messages = threadForSession(storedKey)?.messages ?? []
    expect(messages[0]?.text).toBe('rendered output\n/opt/data/.hermes/cache/render 1.png')
    expect(messages[0]?.attachments).toBeUndefined()
    expect(messages[1]?.text).toBe('artifact ready\n`/opt/data/wiki/personal/notes.pdf`')
    expect(messages[1]?.attachments).toBeUndefined()
    expect(messages[2]?.text).toBe('also linkable\n/opt/data/wiki/personal/readme.txt')
    expect(messages[2]?.attachments).toBeUndefined()
  })

  it('keeps live assistant MEDIA references on completion as inline remote references', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    handleGatewayEvent({ session_id: liveSid, type: 'message.start', payload: {} })
    handleGatewayEvent({
      session_id: liveSid,
      type: 'message.complete',
      payload: { text: 'Done\nMEDIA:/opt/data/live.png' }
    })

    const message = threadForSession(storedKey)?.messages[0]
    expect(message?.text).toBe('Done\nMEDIA:/opt/data/live.png')
    expect(message?.attachments).toBeUndefined()
  })

  it('extracts stored assistant canvas references into the thread canvas sidebar state', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    hydrateSessionMessagesFromGateway(liveSid, [
      {
        content: 'rendered output\nCANVAS:/tmp/render.html',
        role: 'assistant',
        timestamp: 104
      } as SessionMessage
    ])

    const thread = threadForSession(storedKey)
    expect(thread?.messages[0]?.text).toBe('rendered output')
    expect(thread?.canvas).toMatchObject({
      label: 'render.html',
      path: '/tmp/render.html',
      source: '/tmp/render.html'
    })
  })

  it('extracts live assistant canvas references on completion', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    handleGatewayEvent({ session_id: liveSid, type: 'message.start', payload: {} })
    handleGatewayEvent({
      session_id: liveSid,
      type: 'message.complete',
      payload: { text: 'Canvas ready\nCANVAS:/opt/data/live-render.html' }
    })

    const thread = threadForSession(storedKey)
    expect(thread?.messages[0]?.text).toBe('Canvas ready')
    expect(thread?.canvas).toMatchObject({
      label: 'live-render.html',
      path: '/opt/data/live-render.html',
      source: '/opt/data/live-render.html'
    })
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
    expect(promptsState.sudoRequest).toEqual({ profile: null, requestId: 'sudo-1', sessionId: storedKey })
    expect(promptsState.secretRequest).toEqual({
      envVar: 'TOKEN',
      profile: null,
      prompt: 'Enter token',
      requestId: 'secret-1',
      sessionId: storedKey
    })
    expect(sessionState.needsInputSessionIds).toContain(storedKey)
  })

  it('sends a macOS notification when a prompt needs operator input', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { choices: ['red', 'blue'], question: 'Pick a color', request_id: 'clarify-1' },
      session_id: liveSid,
      type: 'clarify.request'
    })

    expect(mockSendMacosNotification).toHaveBeenCalledWith({
      title: 'BITCH needs input',
      body: 'Pick a color'
    })
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
      summary: 'Running'
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

  it('updates a running tool in place when gateway events omit tool_id', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { context: 'npm run test', name: 'terminal' },
      session_id: liveSid,
      type: 'tool.start'
    })

    const thread = threadForSession(storedKey)
    expect(thread?.messages[0]?.tools).toHaveLength(1)
    expect(thread?.messages[0]?.tools[0]).toMatchObject({
      context: 'npm run test',
      name: 'terminal',
      status: 'running'
    })

    handleGatewayEvent({
      payload: { name: 'terminal', output: 'tests passed' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    expect(thread?.messages[0]?.tools).toHaveLength(1)
    expect(thread?.messages[0]?.tools[0]).toMatchObject({
      context: 'npm run test',
      name: 'terminal',
      output: 'tests passed',
      status: 'complete'
    })
  })

  it('matches missing-tool_id events by name without touching other running tools', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { context: 'task A', name: 'delegate_task' },
      session_id: liveSid,
      type: 'tool.start'
    })
    handleGatewayEvent({
      payload: { context: 'npm run test', name: 'terminal' },
      session_id: liveSid,
      type: 'tool.start'
    })

    const thread = threadForSession(storedKey)
    expect(thread?.messages[0]?.tools).toHaveLength(2)

    handleGatewayEvent({
      payload: { name: 'terminal', output: 'tests passed' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    const tools = thread?.messages[0]?.tools ?? []
    expect(tools.find(tool => tool.name === 'terminal')?.status).toBe('complete')
    expect(tools.find(tool => tool.name === 'delegate_task')?.status).toBe('running')
  })

  it('falls back to name match when a stable id is present but not yet known', () => {
    rememberRuntimeSession(storedKey, liveSid)

    // Live stream starts without a tool_id — synthetic id minted locally.
    handleGatewayEvent({
      payload: { context: 'npm run test', name: 'terminal' },
      session_id: liveSid,
      type: 'tool.start'
    })

    const thread = threadForSession(storedKey)
    const syntheticId = thread?.messages[0]?.tools[0]?.id
    expect(syntheticId).toBeDefined()

    // Later events carry a real tool_id that the local row has never seen.
    // Upstream findToolPartIndex falls through to name matching so the
    // synthetic row is updated in place instead of appending a duplicate.
    handleGatewayEvent({
      payload: { context: 'npm test', name: 'terminal', tool_id: 'real-tool-id' },
      session_id: liveSid,
      type: 'tool.progress'
    })

    handleGatewayEvent({
      payload: { name: 'terminal', output: 'done', tool_id: 'real-tool-id' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    expect(thread?.messages[0]?.tools).toHaveLength(1)
    expect(thread?.messages[0]?.tools[0]).toMatchObject({
      context: 'npm test',
      id: syntheticId,
      name: 'terminal',
      output: 'done',
      status: 'complete'
    })
  })

  it('matches per-event payload.id via name fallback when no tool-specific id exists', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { name: 'terminal' },
      session_id: liveSid,
      type: 'tool.start'
    })

    // payload.id is used as a stable-id fallback; if it changes per event
    // and no tool_id is present, name fallback prevents duplicates.
    handleGatewayEvent({
      payload: { context: 'npm test', id: 'evt-progress-1', name: 'terminal' },
      session_id: liveSid,
      type: 'tool.progress'
    })

    handleGatewayEvent({
      payload: { id: 'evt-complete-1', name: 'terminal', output: 'done' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    const thread = threadForSession(storedKey)
    expect(thread?.messages[0]?.tools).toHaveLength(1)
    expect(thread?.messages[0]?.tools[0]).toMatchObject({
      context: 'npm test',
      name: 'terminal',
      output: 'done',
      status: 'complete'
    })
  })

  it('splits reasoning blocks around tool events so they interleave like rehydration', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({ session_id: liveSid, type: 'message.start', payload: {} })

    handleGatewayEvent({
      payload: { text: 'first thought' },
      session_id: liveSid,
      type: 'reasoning.delta'
    })
    handleGatewayEvent({
      payload: { name: 'terminal' },
      session_id: liveSid,
      type: 'tool.start'
    })
    handleGatewayEvent({
      payload: { name: 'terminal', output: 'done' },
      session_id: liveSid,
      type: 'tool.complete'
    })
    handleGatewayEvent({
      payload: { text: 'second thought' },
      session_id: liveSid,
      type: 'reasoning.delta'
    })

    const thread = threadForSession(storedKey)
    const reasoning = thread?.messages[0]?.reasoning
    expect(reasoning).toHaveLength(2)
    expect(reasoning?.[0]).toBe('first thought')
    expect(reasoning?.[1]).toBe('second thought')
  })

  it('splits reasoning blocks when text deltas arrive after reasoning', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({ session_id: liveSid, type: 'message.start', payload: {} })

    handleGatewayEvent({
      payload: { text: 'planning phase' },
      session_id: liveSid,
      type: 'reasoning.delta'
    })
    handleGatewayEvent({
      payload: { text: 'Hello' },
      session_id: liveSid,
      type: 'message.delta'
    })
    handleGatewayEvent({
      payload: { text: 'post-text reasoning' },
      session_id: liveSid,
      type: 'reasoning.delta'
    })

    const thread = threadForSession(storedKey)
    const reasoning = thread?.messages[0]?.reasoning
    expect(reasoning).toHaveLength(2)
    expect(reasoning?.[0]).toBe('planning phase')
    expect(reasoning?.[1]).toBe('post-text reasoning')
  })

  it('builds chronological parts during live streaming', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({ session_id: liveSid, type: 'message.start', payload: {} })
    handleGatewayEvent({
      payload: { text: 'thinking first' },
      session_id: liveSid,
      type: 'reasoning.delta'
    })
    handleGatewayEvent({
      payload: { name: 'terminal', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.start'
    })
    handleGatewayEvent({
      payload: { text: 'final answer' },
      session_id: liveSid,
      type: 'message.delta'
    })

    const parts = threadForSession(storedKey)?.messages[0]?.parts
    expect(parts).toHaveLength(3)
    expect(parts?.[0]).toMatchObject({ type: 'reasoning', text: 'thinking first' })
    expect(parts?.[1]).toMatchObject({ type: 'tool', tool: { id: 'tool-1', name: 'terminal', status: 'running' } })
    expect(parts?.[2]).toMatchObject({ type: 'text', text: 'final answer' })
  })

  it('completes a running tool after message.complete clears the current assistant pointer', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({ session_id: liveSid, type: 'message.start', payload: {} })
    handleGatewayEvent({
      payload: { context: 'npm run test', name: 'terminal', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.start'
    })
    handleGatewayEvent({
      payload: { text: 'All done.' },
      session_id: liveSid,
      type: 'message.complete'
    })
    handleGatewayEvent({
      payload: { name: 'terminal', output: 'tests passed', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    const thread = threadForSession(storedKey)
    expect(thread?.messages).toHaveLength(1)
    expect(thread?.messages[0]?.tools).toHaveLength(1)
    expect(thread?.messages[0]?.tools[0]).toMatchObject({
      id: 'tool-1',
      output: 'tests passed',
      status: 'complete'
    })
    expect(thread?.messages[0]?.parts?.[0]).toMatchObject({
      type: 'tool',
      tool: { id: 'tool-1', status: 'complete' }
    })
    expect(mockSendMacosNotification).toHaveBeenCalledWith({
      title: 'BITCH finished',
      body: 'All done.'
    })
  })

  it('bumps parts when an existing tool is updated in place', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { name: 'terminal', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.start'
    })

    const thread = threadForSession(storedKey)
    const messagesBefore = thread?.messages

    handleGatewayEvent({
      payload: { name: 'terminal', output: 'done', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    expect(thread?.messages).not.toBe(messagesBefore)
    expect(thread?.messages[0]?.tools[0]?.status).toBe('complete')
    expect(thread?.messages[0]?.parts?.[0]).toMatchObject({
      type: 'tool',
      tool: { id: 'tool-1', status: 'complete', output: 'done' }
    })
  })

  it('completes the sole running tool when completion payload omits the tool name', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { context: 'npm run test', name: 'terminal', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.start'
    })
    handleGatewayEvent({
      payload: { output: 'tests passed', tool_id: 'tool-1' },
      session_id: liveSid,
      type: 'tool.complete'
    })

    expect(threadForSession(storedKey)?.messages[0]?.tools[0]).toMatchObject({
      id: 'tool-1',
      name: 'terminal',
      output: 'tests passed',
      status: 'complete'
    })
  })

  it('marks tool.progress payloads with completed status as complete', () => {
    rememberRuntimeSession(storedKey, liveSid)

    handleGatewayEvent({
      payload: { name: 'terminal', toolCallId: 'tool-1' },
      session_id: liveSid,
      type: 'tool.start'
    })
    handleGatewayEvent({
      payload: { output: 'done', status: 'completed', toolCallId: 'tool-1' },
      session_id: liveSid,
      type: 'tool.progress'
    })

    expect(threadForSession(storedKey)?.messages[0]?.tools[0]).toMatchObject({
      id: 'tool-1',
      output: 'done',
      status: 'complete'
    })
  })

  it('merges stored tool messages into the preceding assistant with parts', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    hydrateSessionMessagesFromGateway(liveSid, [
      {
        content: 'Let me check that.',
        role: 'assistant',
        text: 'Let me check that.',
        timestamp: 100
      } as SessionMessage,
      {
        content: 'file contents here',
        role: 'tool',
        tool_call_id: 'call-1',
        tool_name: 'read_file',
        timestamp: 101
      } as SessionMessage
    ])

    const thread = threadForSession(storedKey)
    expect(thread?.messages).toHaveLength(1)

    const assistant = thread?.messages[0]
    expect(assistant?.role).toBe('assistant')
    expect(assistant?.tools).toHaveLength(1)
    expect(assistant?.tools[0]).toMatchObject({
      id: 'call-1',
      name: 'read_file',
      output: 'file contents here',
      status: 'complete'
    })
    expect(assistant?.parts).toHaveLength(2)
    expect(assistant?.parts?.[0]).toMatchObject({ type: 'text', text: 'Let me check that.' })
    expect(assistant?.parts?.[1]).toMatchObject({
      type: 'tool',
      tool: { id: 'call-1', name: 'read_file', status: 'complete' }
    })
  })

  it('keeps orphaned stored tool messages as standalone rows', () => {
    sessionState.activeSessionId = liveSid
    sessionState.storedSessionId = storedKey

    hydrateSessionMessagesFromGateway(liveSid, [
      {
        content: 'orphan output',
        role: 'tool',
        tool_call_id: 'orphan-1',
        tool_name: 'terminal',
        timestamp: 100
      } as SessionMessage
    ])

    const thread = threadForSession(storedKey)
    expect(thread?.messages).toHaveLength(1)
    expect(thread?.messages[0]?.role).toBe('tool')
    expect(thread?.messages[0]?.parts).toEqual([
      {
        type: 'tool',
        tool: expect.objectContaining({ id: 'orphan-1', name: 'terminal', status: 'complete' })
      }
    ])
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
