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

vi.mock('$lib/hermes/dashboard', () => ({
  getGlobalModelInfo: mockGetGlobalModelInfo,
  getModelOptions: mockGetModelOptions,
  getProfiles: mockGetProfiles
}))

vi.mock('$lib/hermes/gateway', () => ({
  requestGateway: mockRequestGateway
}))

vi.mock('$lib/hermes/conversations', () => ({
  appendAssistantErrorMessage: mockAppendAssistantErrorMessage,
  appendSystemMessage: mockAppendSystemMessage,
  appendUserMessage: vi.fn(),
  setConversationBusy: vi.fn(),
  conversationForSession: vi.fn()
}))

vi.mock('$lib/hermes/profiles', () => ({
  ensureGatewayProfile: mockEnsureGatewayProfile,
  normalizeProfileKey: (value: string) => value.trim().toLowerCase(),
  profileState: mockProfileState
}))

vi.mock('$lib/hermes/sessions', () => ({
  createSession: mockCreateSession,
  displaySessionIdFor: (id: string) => id,
  lineageIdForSessionId: (id: string | null | undefined) => id?.trim() || null,
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

import { composerState, executeSlashCommand, setComposerDraft } from '$lib/hermes/composer'

function resetComposerSession(): void {
  composerState.sessions = {}
  composerState.model.error = null
  composerState.model.fastSwitching = false
  composerState.model.info = null
  composerState.model.loading = false
  composerState.model.options = null
  composerState.model.reasoningSwitching = false
  composerState.model.switching = false
  composerState.newSessionFastSelection = null
  composerState.newSessionModelSelection = null
  composerState.newSessionReasoningSelection = null
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
