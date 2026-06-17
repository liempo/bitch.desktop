import { getActiveProfile, getProfiles, setApiRequestProfile } from '$lib/api/dashboard'
import { messageForError } from '$lib/errors'
import { ensureGatewayForProfile } from '$lib/stores/gateway.svelte'
import type { ProfileInfo } from '$lib/types/hermes'

export const ALL_PROFILES = '__all__'

const PROFILE_ORDER_STORAGE_KEY = 'bitch.desktop.profileOrder'
const SHOW_ALL_PROFILES_STORAGE_KEY = 'bitch.desktop.showAllProfiles'

interface ProfileState {
  activeGatewayProfile: string
  activeProfile: string
  error: null | string
  freshSessionRequest: number
  gatewaySwapTarget: null | string
  loading: boolean
  newChatProfile: null | string
  profileOrder: string[]
  profiles: ProfileInfo[]
  showAllProfiles: boolean
}

function hasLocalStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined'
}

function readJson<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback

  try {
    const raw = globalThis.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (!hasLocalStorage()) return fallback
  const value = globalThis.localStorage.getItem(key)

  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function writeBoolean(key: string, value: boolean): void {
  if (!hasLocalStorage()) return
  globalThis.localStorage.setItem(key, value ? 'true' : 'false')
}

export function normalizeProfileKey(name: null | string | undefined): string {
  const value = (name ?? '').trim()
  return value || 'default'
}

export const profileState = $state<ProfileState>({
  activeGatewayProfile: 'default',
  activeProfile: 'default',
  error: null,
  freshSessionRequest: 0,
  gatewaySwapTarget: null,
  loading: false,
  newChatProfile: null,
  profileOrder: readJson<string[]>(PROFILE_ORDER_STORAGE_KEY, []),
  profiles: [],
  showAllProfiles: readBoolean(SHOW_ALL_PROFILES_STORAGE_KEY, false)
})

export function getProfileScope(): string {
  return profileState.showAllProfiles ? ALL_PROFILES : normalizeProfileKey(profileState.activeGatewayProfile)
}

export function sortByProfileOrder<T extends { name: string }>(items: T[], order = profileState.profileOrder): T[] {
  const rank = new Map(order.map((name, index) => [name, index]))

  return [...items].sort((a, b) => {
    const ra = rank.get(a.name)
    const rb = rank.get(b.name)

    if (ra != null && rb != null) return ra - rb
    return ra != null ? -1 : rb != null ? 1 : a.name.localeCompare(b.name)
  })
}

export async function refreshActiveProfile(): Promise<void> {
  profileState.loading = true
  profileState.error = null

  try {
    const active = await getActiveProfile()
    const current = normalizeProfileKey(active.current || active.active)
    profileState.activeProfile = current

    if (!profileState.activeGatewayProfile) {
      profileState.activeGatewayProfile = current
    }
  } catch (error) {
    profileState.error = messageForError(error)
  }

  try {
    const { profiles } = await getProfiles()
    profileState.profiles = profiles
  } catch (error) {
    profileState.error = messageForError(error)
  } finally {
    profileState.loading = false
  }
}

function requestFreshSession(): void {
  profileState.freshSessionRequest += 1
}

function routeApiToProfile(profile: string): void {
  setApiRequestProfile(normalizeProfileKey(profile))
}

let gatewaySwitch: Promise<void> | null = null

export async function ensureGatewayProfile(profile: null | string | undefined): Promise<void> {
  if (profile == null || !String(profile).trim()) {
    if (gatewaySwitch) {
      await gatewaySwitch.catch(() => undefined)
    }

    return
  }

  const target = normalizeProfileKey(profile)
  const previous = normalizeProfileKey(profileState.activeGatewayProfile)
  routeApiToProfile(target)

  if (previous === target) {
    await ensureGatewayForProfile(target)
    return
  }

  if (gatewaySwitch) {
    await gatewaySwitch.catch(() => undefined)

    if (normalizeProfileKey(profileState.activeGatewayProfile) === target) {
      routeApiToProfile(target)
      return
    }
  }

  profileState.gatewaySwapTarget = target
  gatewaySwitch = (async () => {
    await ensureGatewayForProfile(target)
    profileState.activeGatewayProfile = target
    routeApiToProfile(target)
  })()

  try {
    await gatewaySwitch
  } catch (error) {
    routeApiToProfile(previous)
    throw error
  } finally {
    gatewaySwitch = null
    profileState.gatewaySwapTarget = null
  }
}

export function selectProfile(name: string): void {
  const target = normalizeProfileKey(name)
  const switching = profileState.showAllProfiles || target !== normalizeProfileKey(profileState.activeGatewayProfile)

  profileState.showAllProfiles = false
  writeBoolean(SHOW_ALL_PROFILES_STORAGE_KEY, false)
  profileState.newChatProfile = target

  if (switching) {
    requestFreshSession()
  }

  void ensureGatewayProfile(target)
}

export function selectNewSessionProfile(name: string): void {
  const target = normalizeProfileKey(name)
  profileState.newChatProfile = target
  void ensureGatewayProfile(target)
}

function mainProfileName(): string {
  return normalizeProfileKey(profileState.profiles.find(profile => profile.is_default)?.name ?? 'default')
}

export function selectMainNewSessionProfile(): void {
  selectNewSessionProfile(mainProfileName())
}

export function setShowAllProfiles(value: boolean): void {
  profileState.showAllProfiles = value
  writeBoolean(SHOW_ALL_PROFILES_STORAGE_KEY, value)
}
