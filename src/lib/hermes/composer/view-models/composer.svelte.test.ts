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

vi.mock('$lib/hermes/dashboard', () => ({
  getGlobalModelInfo: vi.fn(),
  getModelOptions: vi.fn(),
  getProfiles: mockGetProfiles,
  listSessions: vi.fn(),
  setApiRequestProfile: vi.fn()
}))

vi.mock('$lib/hermes/gateway', () => ({
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
  currentModelLabel,
  executeSlashCommand,
  groupedModelOptions,
  selectComposerFastMode,
  selectComposerModel,
  selectComposerReasoningEffort,
  shouldDispatchSlashImmediately,
  slashSuggestions,
  submitPrompt,
  type ComposerAttachment
} from '$lib/hermes/composer'
import { clearQueuedPrompts, getQueuedPrompts } from '$lib/hermes/composer'
import { messageState, setThreadBusy, threadForSession } from '$lib/hermes/threads'
import { profileState } from '$lib/hermes/profiles'
import { rememberRuntimeSession, sessionState } from '$lib/hermes/sessions'

describe('composer slash dispatch policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    composerState.sessions = {}
  })

  it('treats slash commands as immediate control-plane commands even while busy', () => {
    expect(shouldDispatchSlashImmediately('/compact', true)).toBe(true)
    expect(shouldDispatchSlashImmediately('  /goal status  ', true)).toBe(true)
    expect(shouldDispatchSlashImmediately('/compact', false)).toBe(true)
    expect(shouldDispatchSlashImmediately('normal prompt', true)).toBe(false)
  })

  it('treats every slash-prefixed draft as a command', () => {
    expect(shouldDispatchSlashImmediately('/reset', true)).toBe(true)
    expect(shouldDispatchSlashImmediately('/new', false)).toBe(true)
    expect(shouldDispatchSlashImmediately('/not-real', false)).toBe(true)
  })

  it('shows slash aliases from the loaded command catalog', () => {
    composerState.sessions['stored-A'] = {
      attachments: [],
      commandCatalog: [
        { command: '/compact', description: 'compact context' },
        { command: '/reset', description: 'reset session state' },
        { command: '/new', description: 'start new session' }
      ],
      commandError: null,
      draft: '',
      error: null,
      loadingCommands: false,
      submitting: false,
      userInterrupted: false
    }

    expect(slashSuggestions('stored-A', '/c').map(item => item.command)).toEqual(['/compact'])
    expect(slashSuggestions('stored-A', '/n').map(item => item.command)).toEqual(['/new'])
    expect(slashSuggestions('stored-A', '/res').map(item => item.command)).toEqual(['/reset'])
  })
})

describe('composer runtime targeting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouterState.route = 'session'
    mockRouterState.sessionId = 'other-stored'
    composerState.sessions = {}
    composerState.threadFastSelections = {}
    composerState.threadModelSelections = {}
    composerState.threadReasoningSelections = {}
    resetComposerModelState()
    messageState.sessions = {}
    sessionState.activeSessionId = 'other-live'
    sessionState.storedSessionId = 'other-stored'
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.storedSessionIdsByRuntimeId = {}
    sessionState.sessionProfilesById = {}
    sessionState.sessionThreadIdsById = {}
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

  it('clears the composer and appends the user message before gateway preparation resolves', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    composerState.sessions['stored-A'] = {
      attachments: [],
      commandCatalog: [],
      commandError: null,
      draft: 'slow uplink payload',
      error: null,
      loadingCommands: false,
      submitting: false,
      userInterrupted: false
    }

    let releaseGateway!: () => void
    const gatewayReady = new Promise<void>(resolve => {
      releaseGateway = resolve
    })
    mockEnsureGatewayForProfile.mockReturnValueOnce(gatewayReady)
    mockRequestGateway.mockResolvedValueOnce({ ok: true })

    const submission = submitPrompt('stored-A')
    await Promise.resolve()

    const draftWhileGatewayPreparing = composerState.sessions['stored-A']?.draft
    const busyWhileGatewayPreparing = threadForSession('stored-A')?.busy
    const messagesWhileGatewayPreparing = threadForSession('stored-A')?.messages.map(message => message.text)
    const submitCallWhilePreparing = mockRequestGateway.mock.calls.some(([method]) => method === 'prompt.submit')

    releaseGateway()
    await expect(submission).resolves.toBe(true)

    expect(draftWhileGatewayPreparing).toBe('')
    expect(busyWhileGatewayPreparing).toBe(true)
    expect(messagesWhileGatewayPreparing).toEqual(['slow uplink payload'])
    expect(submitCallWhilePreparing).toBe(false)
  })

  it('resets submit state when gateway preparation fails before prompt.submit', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    composerState.sessions['stored-A'] = {
      attachments: [],
      commandCatalog: [],
      commandError: null,
      draft: 'profile-bound payload',
      error: null,
      loadingCommands: false,
      submitting: false,
      userInterrupted: false
    }
    mockEnsureGatewayForProfile.mockRejectedValueOnce(new Error('profile gateway unavailable'))

    await expect(submitPrompt('stored-A')).resolves.toBe(false)

    expect(composerState.sessions['stored-A']?.submitting).toBe(false)
    expect(composerState.sessions['stored-A']?.error).toBe('profile gateway unavailable')
    expect(threadForSession('stored-A')?.busy).toBe(false)
    expect(threadForSession('stored-A')?.messages.map(message => message.role)).toEqual(['user', 'assistant'])
    expect(mockRequestGateway).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
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

  it('uploads PDFs through file.attach and submits the returned @file ref', async () => {
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
      if (method === 'file.attach') {
        return Promise.resolve({ attached: true, ref_text: '@file:.hermes/desktop-attachments/brief.pdf' })
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt('stored-A', { attachments: [pdf], text: '' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('file.attach', {
      data_url: 'data:application/pdf;base64,JVBERi0xLjQ=',
      name: 'brief.pdf',
      path: 'brief.pdf',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: '@file:.hermes/desktop-attachments/brief.pdf'
    })
    expect(threadForSession('stored-A')?.messages.at(-1)?.text).toBe(
      'Please review the attached PDF.\n\nAttached files:\n- brief.pdf (PDF · 8 B)'
    )
  })

  it('uploads generic files through file.attach before submitting visible text', async () => {
    rememberRuntimeSession('stored-A', 'live-A')
    const textFile: ComposerAttachment = {
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
      detail: 'text/plain · 5 B',
      id: 'file-1',
      kind: 'file',
      label: 'notes.txt',
      mediaType: 'text/plain',
      size: 5
    }

    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'file.attach') {
        return Promise.resolve({ attached: true, ref_text: '@file:.hermes/desktop-attachments/notes.txt' })
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt('stored-A', { attachments: [textFile], text: 'summarize this' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('file.attach', {
      data_url: 'data:text/plain;base64,aGVsbG8=',
      name: 'notes.txt',
      path: 'notes.txt',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: '@file:.hermes/desktop-attachments/notes.txt\n\nsummarize this'
    })
  })

  it('does not submit when file.attach fails for a non-image attachment', async () => {
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
      message: 'file not found on gateway and no data_url provided'
    })

    await expect(submitPrompt('stored-A', { attachments: [pdf], text: 'review this' })).resolves.toBe(false)

    expect(mockRequestGateway).toHaveBeenCalledWith('file.attach', expect.anything())
    expect(mockRequestGateway).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
    expect(composerState.sessions['stored-A']?.error).toBe('file not found on gateway and no data_url provided')
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

  it('can create and submit a new embedded session without navigating to the agent route', async () => {
    mockRouterState.route = 'new'
    mockRouterState.sessionId = null
    sessionState.activeSessionId = null
    sessionState.storedSessionId = null

    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'session.create') {
        return Promise.resolve({
          session_id: 'live-dashboard',
          stored_session_id: 'stored-dashboard',
          message_count: 0,
          messages: [],
          info: { model: 'test-model' }
        })
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt(null, { commitRoute: false, text: 'dashboard message' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenCalledWith('session.create', expect.anything())
    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-dashboard',
      text: 'dashboard message'
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(threadForSession('stored-dashboard')?.messages.map(message => message.text)).toEqual(['dashboard message'])
  })

  it('can reset the embedded composer session without navigating', async () => {
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'

    await expect(executeSlashCommand('stored-A', '/new', { commitRoute: false })).resolves.toBe(true)

    expect(sessionState.activeSessionId).toBeNull()
    expect(sessionState.storedSessionId).toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
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

  it('keeps a selected model attached to the lineage when a continuation gets a new stored id', async () => {
    sessionState.sessionThreadIdsById = {
      'stored-root': 'stored-root',
      'stored-tip': 'stored-root'
    }
    rememberRuntimeSession('stored-root', 'live-root')
    mockRequestGateway.mockResolvedValueOnce({ output: 'model switched' })

    await expect(selectComposerModel('stored-root', 'openrouter\u0000anthropic/claude-opus-4.1')).resolves.toBe(true)

    composerState.model.info = { model: 'default-model', provider: 'default-provider' }
    expect(currentModelLabel('stored-tip')).toBe('openrouter / anthropic/claude-opus-4.1')
  })

  it('reapplies the lineage-selected model before submitting through a renewed continuation runtime', async () => {
    sessionState.sessionThreadIdsById = {
      'stored-root': 'stored-root',
      'stored-tip': 'stored-root'
    }
    rememberRuntimeSession('stored-tip', 'live-tip')
    composerState.threadModelSelections = {
      'stored-root': { model: 'anthropic/claude-opus-4.1', provider: 'openrouter' }
    }
    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'slash.exec') return Promise.resolve({ output: 'model preserved' })
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(submitPrompt('stored-tip', { text: 'continue same thread' })).resolves.toBe(true)

    expect(mockRequestGateway).toHaveBeenNthCalledWith(1, 'slash.exec', {
      command: '/model anthropic/claude-opus-4.1 --provider openrouter',
      profile: 'default',
      session_id: 'live-tip'
    })
    expect(mockRequestGateway).toHaveBeenNthCalledWith(2, 'prompt.submit', {
      profile: 'default',
      session_id: 'live-tip',
      text: 'continue same thread'
    })
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

  it('reports unknown slash commands without submitting them as prompts', async () => {
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'
    rememberRuntimeSession('stored-A', 'live-A')
    mockRequestGateway.mockImplementation((method: string) => {
      if (method === 'slash.exec') {
        return Promise.reject(new Error('pending-input command: use command.dispatch for /not-real'))
      }
      if (method === 'command.dispatch') {
        return Promise.reject(new Error('not a quick/plugin/skill command: not-real'))
      }
      if (method === 'prompt.submit') return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })

    await expect(executeSlashCommand('stored-A', '/not-real')).resolves.toBe(false)

    expect(mockRequestGateway).toHaveBeenCalledWith('slash.exec', {
      command: 'not-real',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).toHaveBeenCalledWith('command.dispatch', {
      name: 'not-real',
      arg: '',
      profile: 'default',
      session_id: 'live-A'
    })
    expect(mockRequestGateway).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
    expect(threadForSession('stored-A')?.messages.at(-1)?.error).toBe('Command not found: /not-real')
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

  it('does not queue command.dispatch send payloads from slash commands while busy', async () => {
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'
    rememberRuntimeSession('stored-A', 'live-A')
    clearQueuedPrompts('stored-A')
    setThreadBusy('stored-A', true)
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
      if (method === 'prompt.submit') return Promise.reject(new Error('session busy'))
      return Promise.resolve({})
    })

    await expect(executeSlashCommand('stored-A', '/goal build a rocket')).resolves.toBe(false)

    expect(mockRequestGateway).toHaveBeenCalledWith('prompt.submit', {
      profile: 'default',
      session_id: 'live-A',
      text: 'build a rocket'
    })
    expect(getQueuedPrompts('stored-A')).toEqual([])
    expect(composerState.sessions['stored-A']?.error).toBe('session busy')
    expect(threadForSession('stored-A')?.messages.map(message => message.text)).toEqual([
      'slash:/goal build a rocket\nGoal set. 20-turn budget.'
    ])
  })
})

describe('composer session busy recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    composerState.sessions = {}
    composerState.threadFastSelections = {}
    composerState.threadModelSelections = {}
    composerState.threadReasoningSelections = {}
    resetComposerModelState()
    messageState.sessions = {}
    clearQueuedPrompts('stored-A')
    sessionState.activeSessionId = 'live-A'
    sessionState.storedSessionId = 'stored-A'
    sessionState.workingSessionIds = []
    sessionState.needsInputSessionIds = []
    sessionState.runtimeIdsByStoredSessionId = {}
    sessionState.storedSessionIdsByRuntimeId = {}
    sessionState.sessionThreadIdsById = {}
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
