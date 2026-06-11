import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockAppendAssistantErrorMessage,
  mockAppendSystemMessage,
  mockCreateSession,
  mockEnsureGatewayProfile,
  mockGetGlobalModelInfo,
  mockGetModelOptions,
  mockGetProfiles,
  mockLoadSessions,
  mockNavigate,
  mockRequestGateway,
  mockSessionRoute,
  mockSessionState,
  mockProfileState,
  mockRouterState
} = vi.hoisted(() => ({
  mockAppendAssistantErrorMessage: vi.fn(),
  mockAppendSystemMessage: vi.fn(),
  mockCreateSession: vi.fn(),
  mockEnsureGatewayProfile: vi.fn(),
  mockGetGlobalModelInfo: vi.fn(),
  mockGetModelOptions: vi.fn(),
  mockGetProfiles: vi.fn(),
  mockLoadSessions: vi.fn(),
  mockNavigate: vi.fn(),
  mockRequestGateway: vi.fn(),
  mockSessionRoute: vi.fn((id: string) => `/${id}`),
  mockSessionState: {
    activeSessionId: 'live-1',
    storedSessionId: null
  },
  mockProfileState: {
    activeGatewayProfile: 'default',
    newChatProfile: null,
    profiles: []
  },
  mockRouterState: {
    route: 'new',
    sessionId: null
  }
}))

vi.mock('$lib/api/dashboard', () => ({
  getGlobalModelInfo: mockGetGlobalModelInfo,
  getModelOptions: mockGetModelOptions,
  getProfiles: mockGetProfiles
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  requestGateway: mockRequestGateway
}))

vi.mock('$lib/stores/messages.svelte', () => ({
  appendAssistantErrorMessage: mockAppendAssistantErrorMessage,
  appendSystemMessage: mockAppendSystemMessage,
  appendUserMessage: vi.fn(),
  setThreadBusy: vi.fn(),
  threadForSession: vi.fn()
}))

vi.mock('$lib/stores/profile.svelte', () => ({
  ensureGatewayProfile: mockEnsureGatewayProfile,
  normalizeProfileKey: (value: string) => value.trim().toLowerCase(),
  profileState: mockProfileState
}))

vi.mock('$lib/stores/session.svelte', () => ({
  createSession: mockCreateSession,
  displaySessionIdFor: (id: string) => id,
  loadSessions: mockLoadSessions,
  profileForSession: vi.fn(() => null),
  runtimeSessionIdForStored: vi.fn(() => null),
  sessionState: mockSessionState
}))

vi.mock('@/app/agent/router.svelte', () => ({
  navigate: mockNavigate,
  routerState: mockRouterState,
  sessionRoute: mockSessionRoute
}))

import { composerState, executeSlashCommand, setComposerDraft } from '$lib/stores/composer.svelte'

function resetComposerSession(): void {
  composerState.sessions = {}
  composerState.model.error = null
  composerState.model.fastSwitching = false
  composerState.model.info = null
  composerState.model.loading = false
  composerState.model.options = null
  composerState.model.reasoningSwitching = false
  composerState.model.switching = false
}

describe('executeSlashCommand reload-mcp routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionState.activeSessionId = 'live-1'
    mockSessionState.storedSessionId = null
    mockProfileState.activeGatewayProfile = 'default'
    mockProfileState.newChatProfile = null
    mockRouterState.route = 'new'
    mockRouterState.sessionId = null
    mockCreateSession.mockResolvedValue('live-created')
    mockEnsureGatewayProfile.mockResolvedValue(undefined)
    mockLoadSessions.mockResolvedValue(undefined)
    mockRequestGateway.mockResolvedValue({})
    mockGetGlobalModelInfo.mockResolvedValue({})
    mockGetModelOptions.mockResolvedValue({})
    mockGetProfiles.mockResolvedValue({ profiles: [] })
    resetComposerSession()
  })

  it.each(['/reload-mcp', '/reload_mcp'])('routes %s to the MCP reload gateway method', async command => {
    setComposerDraft(null, 'keep me')
    composerState.sessions.__new__.attachments = [
      {
        dataUrl: 'data:image/png;base64,AAAA',
        id: 'attachment-1',
        kind: 'image',
        label: 'diagram.png',
        mediaType: 'image/png',
        size: 4
      }
    ]

    await expect(executeSlashCommand(null, command)).resolves.toBe(true)

    expect(mockEnsureGatewayProfile).toHaveBeenCalledWith('default')
    expect(mockRequestGateway).toHaveBeenCalledWith('reload.mcp', {
      confirm: true,
      profile: 'default',
      session_id: 'live-1'
    })
    expect(mockAppendSystemMessage).toHaveBeenCalledWith('live-1', `slash:${command}\nMCP servers reloaded.`)
    expect(composerState.sessions.__new__.draft).toBe('')
    expect(composerState.sessions.__new__.attachments).toEqual([])
    expect(mockLoadSessions).toHaveBeenCalledTimes(1)
    expect(mockCreateSession).not.toHaveBeenCalled()
  })
})
