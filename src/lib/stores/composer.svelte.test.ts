import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequestGateway,
  mockNavigate,
  mockSessionRoute,
  mockRouterState,
  mockEnsureGatewayForProfile,
  mockGetProfiles
} = vi.hoisted(() => ({
  mockRequestGateway: vi.fn(),
  mockNavigate: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`),
  mockRouterState: { route: 'new' as 'new' | 'session', sessionId: null as string | null },
  mockEnsureGatewayForProfile: vi.fn(),
  mockGetProfiles: vi.fn()
}))

function resetComposerModelState(): void {
  composerState.model.info = null
  composerState.model.options = null
  composerState.model.error = null
  composerState.model.fastSwitching = false
  composerState.model.loading = false
  composerState.model.switching = false
  composerState.model.reasoningSwitching = false
}

vi.mock('$lib/api/dashboard', () => ({
  getGlobalModelInfo: vi.fn(),
  getModelOptions: vi.fn(),
  getProfiles: mockGetProfiles,
  listSessions: vi.fn(),
  setApiRequestProfile: vi.fn()
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  gatewayState: { connectionState: 'closed' },
  ensureGatewayForProfile: mockEnsureGatewayForProfile,
  requestGateway: mockRequestGateway
}))

vi.mock('@/app/agent/router.svelte', () => ({
  navigate: mockNavigate,
  sessionRoute: mockSessionRoute,
  routerState: mockRouterState
}))

import {
  composerState,
  executeSlashCommand,
  groupedModelOptions,
  selectComposerFastMode,
  selectComposerModel,
  selectComposerReasoningEffort,
  shouldDispatchSlashImmediately,
  submitPrompt,
  type ComposerAttachment
} from '$lib/stores/composer.svelte'
import { clearQueuedPrompts, getQueuedPrompts } from '$lib/stores/composer-queue'
import { messageState, threadForSession } from '$lib/stores/messages.svelte'
import { profileState } from '$lib/stores/profile.svelte'
import { rememberRuntimeSession, sessionState } from '$lib/stores/session.svelte'

describe('composer slash dispatch policy', () => {
  it('treats slash commands as immediate control-plane commands even while busy', () => {
    expect(shouldDispatchSlashImmediately('/compact', true)).toBe(true)
    expect(shouldDispatchSlashImmediately('  /goal status  ', true)).toBe(true)
    expect(shouldDispatchSlashImmediately('/compact', false)).toBe(true)
    expect(shouldDispatchSlashImmediately('normal prompt', true)).toBe(false)
  })
})

describe('composer runtime targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouterState.route = 'session'
    mockRouterState.sessionId = 'other-stored'
    composerState.sessions = {}
    resetComposerModelState()
    messageState.sessions = {}
    sessionState.activeSessionId = 'other-live'
    sessionState.storedSessionId = 'other-stored'
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.storedSessionIdsByRuntimeId = {}
    sessionState.sessionProfilesById = {}
    profileState.activeGatewayProfile = 'default'
    profileState.newChatProfile = null
    profileState.profiles = []
  })

  it('sends prompt.submit to the cached live runtime while keeping UI messages under the stored key', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockResolvedValueOnce({ ok: true })

    await expect(submitPrompt('stored-A', { text: 'hello cached runtime' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: 'hello cached runtime'
    })
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual(['hello cached runtime'])
    expect(messageState.sessions['live-A']).toBeUndefined()
  })

  it('uploads image bytes before submitting text to the remote gateway', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    const image: ComposerAttachment = {
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      id: 'image-1',
      kind: 'image',
      label: 'screen.png',
      mediaType: 'image/png',
      previewUrl: 'data:image/png;base64,aW1hZ2U=',
      size: 5
    }

    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'image.attach_bytes') {
        return Promise.resolve({ attached: true, path: '/opt/data/.hermes/images/upload.png' })
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt('stored-A', { attachments: [image], text: 'inspect this' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('image.attach_bytes', {
      content_base64: 'aW1hZ2U=',
      filename: 'screen.png',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: 'inspect this'
    })
    const attachCall = mockRequestGateway.mock.calls.findIndex(([method]) => method === 'image.attach_bytes')
    const submitCall = mockRequestGateway.mock.calls.findIndex(([method]) => method === 'prompt.submit')
    expect(attachCall).toBeGreaterThanOrEqual(0)
    expect(submitCall).toBeGreaterThan(attachCall)
    expect(threadForSession('stored-A')?.messages.at(-1)?.attachments?.[0]).toMatchObject({
      kind: 'image',
      label: 'screen.png',
      previewUrl: 'data:image/png;base64,aW1hZ2U='
    })
  })

  it('uploads PDFs through pdf.attach and uses a PDF fallback prompt', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    const pdf: ComposerAttachment = {
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
      detail: 'PDF · 8 B',
      id: 'pdf-1',
      kind: 'pdf',
      label: 'brief.pdf',
      mediaType: 'application/pdf',
      size: 8
    }

    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'pdf.attach') return Promise.resolve({ attached: true, pages_attached: 1 })
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt('stored-A', { attachments: [pdf], text: '' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('pdf.attach', {
      content_base64: 'JVBERi0xLjQ=',
      filename: 'brief.pdf',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: 'Please review the attached PDF.'
    })
    expect(threadForSession('stored-A')?.messages.at(-1)?.text).toBe(
      'Please review the attached PDF.\n\nAttached files:\n- brief.pdf (PDF · 8 B)'
    )
  })

  it('does not submit when PDF relay reports missing poppler and shows the remote gateway install hint', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    const pdf: ComposerAttachment = {
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
      id: 'pdf-1',
      kind: 'pdf',
      label: 'brief.pdf',
      mediaType: 'application/pdf',
      size: 8
    }

    mockRequestGateway.mockResolvedValueOnce({
      attached: false,
      message: 'pdftoppm not installed (poppler-utils package required)'
    })

    await expect(submitPrompt('stored-A', { attachments: [pdf], text: 'review this' })).resolves.toBe(false)

    expect(mockRequestGateway).toHaveBeenCalledWith('pdf.attach', expect.anything())
    expect(mockRequestGateway).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
    expect(composerState.sessions['stored-A']?.error).toBe(
      'pdftoppm not installed (poppler-utils package required) Install poppler-utils on the remote Hermes gateway host/container, then restart the gateway.'
    )
  })

  it('does not submit the prompt when attachment byte upload fails', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    const image: ComposerAttachment = {
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      id: 'image-1',
      kind: 'image',
      label: 'broken.png',
      mediaType: 'image/png',
      size: 5
    }

    mockRequestGateway.mockResolvedValueOnce({ attached: false, message: 'unsupported image extension' })

    await expect(submitPrompt('stored-A', { attachments: [image], text: 'inspect this' })).resolves.toBe(false)

    expect(mockRequestGateway).toHaveBeenCalledWith('image.attach_bytes', expect.anything())
    expect(mockRequestGateway).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
    expect(composerState.sessions['stored-A']?.error).toBe('unsupported image extension')
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
      profile: 'default',
      session_id: 'live-new',
      text: 'first message'
    })
    expect(mockNavigate).toHaveBeenCalledWith('/stored-new')
    expect(threadForSession('stored-new')?.messages.map(message => message.text)).toEqual(['first message'])
  })
  it('reports the owning profile locally for /profile instead of forwarding backend default', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    sessionState.sessionProfilesById = { 'stored-A': 'crypto' }
    profileState.activeGatewayProfile = 'default'

    await expect(executeSlashCommand('stored-A', '/profile')).resolves.toBe(true)

    expect(mockRequestGateway).not.toHaveBeenCalledWith('slash.exec', expect.anything())
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual([
      'slash:/profile\nprofile: crypto'
    ])
  })

  it('groups model options with provider metadata and unavailable flags', () => {
    composerState.model.options = {
      model: 'hermes-3',
      provider: 'nous',
      providers: [
        {
          capabilities: {
            'hermes-3': { fast: true, reasoning: true },
            'paid-model': { fast: false, reasoning: false }
          },
          free_tier: true,
          models: ['hermes-3', 'paid-model'],
          name: 'Nous',
          pricing: {
            'hermes-3': { cache: null, free: true, input: 'free', output: 'free' },
            'paid-model': { cache: '$0.10', free: false, input: '$1.00', output: '$2.00' }
          },
          slug: 'nous',
          unavailable_models: ['paid-model']
        }
      ]
    }

    expect(groupedModelOptions()).toEqual([
      expect.objectContaining({
        freeTier: true,
        name: 'Nous',
        provider: 'nous',
        options: [
          expect.objectContaining({ current: true, model: 'hermes-3', unavailable: false }),
          expect.objectContaining({ current: false, model: 'paid-model', unavailable: true })
        ]
      })
    ])
  })

  it('creates a session when switching models from the new-chat route', async () => {
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
      if (method === 'slash.exec') return Promise.resolve({ output: 'model switched' })
      return Promise.resolve({})
    })

    await expect(selectComposerModel(null, 'openai\u0000gpt-5.5')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('session.create', {
      cols: 96,
      profile: 'default'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('slash.exec', {
      command: '/model gpt-5.5 --provider openai',
      profile: 'default',
      session_id: 'live-new'
    })
    expect(mockNavigate).toHaveBeenCalledWith('/stored-new')
    expect(threadForSession('stored-new')?.messages.at(-1)?.text).toBe(
      'slash:/model gpt-5.5 --provider openai\nmodel switched'
    )
  })

  it('uses /reasoning to update the current session reasoning effort', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockResolvedValueOnce({ output: 'reasoning set to high' })

    await expect(selectComposerReasoningEffort('stored-A', 'high')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('slash.exec', {
      command: '/reasoning high',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(threadForSession('stored-A')?.reasoningEffort).toBe('high')
    expect(threadForSession('stored-A')?.messages.at(-1)?.text).toBe('slash:/reasoning high\nreasoning set to high')
  })

  it('uses xhigh, not max, for the max reasoning option', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockResolvedValueOnce({ output: 'reasoning set to xhigh' })

    await expect(selectComposerReasoningEffort('stored-A', 'xhigh')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('slash.exec', {
      command: '/reasoning xhigh',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(threadForSession('stored-A')?.reasoningEffort).toBe('xhigh')
    expect(threadForSession('stored-A')?.messages.at(-1)?.text).toBe('slash:/reasoning xhigh\nreasoning set to xhigh')
  })

  it('uses /fast to update the current session fast mode', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockResolvedValueOnce({ output: 'fast mode on' })

    await expect(selectComposerFastMode('stored-A', true)).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('slash.exec', {
      command: '/fast on',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(threadForSession('stored-A')?.fast).toBe(true)
    expect(threadForSession('stored-A')?.messages.at(-1)?.text).toBe('slash:/fast on\nfast mode on')
  })

  it('uses /profile <name> to target future new chats without backend slash.exec', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    mockGetProfiles.mockResolvedValueOnce({
      profiles: [
        {
          has_env: true,
          is_default: false,
          model: null,
          name: 'crypto',
          path: '/profiles/crypto',
          provider: null,
          skill_count: 0
        }
      ]
    })

    await expect(executeSlashCommand('stored-A', '/profile crypto')).resolves.toBe(true)

    expect(mockRequestGateway).not.toHaveBeenCalledWith('slash.exec', expect.anything())
    expect(profileState.newChatProfile).toBe('crypto')
    expect(mockEnsureGatewayForProfile).toHaveBeenCalledWith('crypto')
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual([
      'slash:/profile crypto\nnew chat profile: crypto'
    ])
  })

  it('falls back to command.dispatch for /goal status when slash.exec rejects pending-input commands', async () => {
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'slash.exec') {
        return Promise.reject(new Error('pending-input command: use command.dispatch for /goal'))
      }
      if (method === 'command.dispatch') {
        return Promise.resolve({ output: 'No active goal', type: 'exec' })
      }
      return Promise.resolve({})
    })

    await expect(executeSlashCommand('stored-A', '/goal status')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('slash.exec', {
      command: 'goal status',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('command.dispatch', {
      name: 'goal',
      arg: 'status',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual([
      'slash:/goal status\nNo active goal'
    ])
  })

  it('uses command.dispatch send payload to kick off /goal prompts', async () => {
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'slash.exec') {
        return Promise.reject(new Error('pending-input command: use command.dispatch for /goal'))
      }
      if (method === 'command.dispatch') {
        return Promise.resolve({
          message: 'build a rocket',
          notice: 'Goal set. 20-turn budget.',
          type: 'send'
        })
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(executeSlashCommand('stored-A', '/goal build a rocket')).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('command.dispatch', {
      name: 'goal',
      arg: 'build a rocket',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: 'build a rocket'
    })
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual([
      'slash:/goal build a rocket\nGoal set. 20-turn budget.',
      'build a rocket'
    ])
  })
})

describe('composer session busy recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    composerState.sessions = {}
    resetComposerModelState()
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
