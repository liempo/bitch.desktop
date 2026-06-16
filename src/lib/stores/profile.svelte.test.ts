import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnsureGatewayForProfile, mockSetApiRequestProfile } = vi.hoisted(() => ({
  mockEnsureGatewayForProfile: vi.fn(),
  mockSetApiRequestProfile: vi.fn()
}))

vi.mock('$lib/api/dashboard', () => ({
  getActiveProfile: vi.fn(),
  getProfiles: vi.fn(),
  setApiRequestProfile: mockSetApiRequestProfile
}))

vi.mock('$lib/stores/gateway.svelte', () => ({
  ensureGatewayForProfile: mockEnsureGatewayForProfile
}))

import {
  ALL_PROFILES,
  ensureGatewayProfile,
  getProfileScope,
  normalizeProfileKey,
  profileState,
  selectMainNewSessionProfile,
  selectNewSessionProfile,
  selectProfile,
  setShowAllProfiles
} from './profile.svelte'

describe('profile store helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    profileState.activeGatewayProfile = 'default'
    profileState.activeProfile = 'default'
    profileState.error = null
    profileState.freshSessionRequest = 0
    profileState.gatewaySwapTarget = null
    profileState.loading = false
    profileState.newChatProfile = null
    profileState.profileOrder = []
    profileState.profiles = []
    profileState.showAllProfiles = false
  })

  it('normalizes blank profiles to default', () => {
    expect(normalizeProfileKey(null)).toBe('default')
    expect(normalizeProfileKey('')).toBe('default')
    expect(normalizeProfileKey('  crypto  ')).toBe('crypto')
  })

  it('derives all-profile and scoped session scopes', () => {
    profileState.activeGatewayProfile = 'crypto'
    expect(getProfileScope()).toBe('crypto')

    setShowAllProfiles(true)
    expect(getProfileScope()).toBe(ALL_PROFILES)
  })

  it('selecting a profile leaves all-profile mode and requests a fresh session', async () => {
    profileState.showAllProfiles = true

    selectProfile('crypto')
    await Promise.resolve()

    expect(profileState.showAllProfiles).toBe(false)
    expect(profileState.newChatProfile).toBe('crypto')
    expect(profileState.freshSessionRequest).toBe(1)
    expect(mockEnsureGatewayForProfile).toHaveBeenCalledWith('crypto')
  })

  it('selecting a new-session profile does not request a fresh session by itself', async () => {
    selectNewSessionProfile('crypto')
    await Promise.resolve()

    expect(profileState.newChatProfile).toBe('crypto')
    expect(profileState.freshSessionRequest).toBe(0)
    expect(mockEnsureGatewayForProfile).toHaveBeenCalledWith('crypto')
  })

  it('selecting the main new-session profile resets to the default profile', async () => {
    profileState.newChatProfile = 'crypto'
    profileState.profiles = [
      {
        has_env: true,
        is_default: true,
        model: null,
        name: 'main',
        path: '/profiles/main',
        provider: null,
        skill_count: 0
      }
    ]

    selectMainNewSessionProfile()
    await Promise.resolve()

    expect(profileState.newChatProfile).toBe('main')
    expect(profileState.freshSessionRequest).toBe(0)
    expect(mockEnsureGatewayForProfile).toHaveBeenCalledWith('main')
  })

  it('ensures the selected gateway profile and routes profile-scoped API calls', async () => {
    await ensureGatewayProfile('crypto')

    expect(mockEnsureGatewayForProfile).toHaveBeenCalledWith('crypto')
    expect(profileState.activeGatewayProfile).toBe('crypto')
    expect(mockSetApiRequestProfile).toHaveBeenCalledWith('crypto')
    expect(profileState.gatewaySwapTarget).toBeNull()
  })
})
