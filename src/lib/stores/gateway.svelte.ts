import { invoke } from '@tauri-apps/api/core'

import { HermesGateway } from '$lib/gateway/hermes'
import type { GatewayEvent } from '$lib/gateway/json-rpc-gateway'
import { consumeLastTauriGatewaySocketError } from '$lib/gateway/tauri-gateway-socket'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

interface ResolvedConnection {
  authMode?: string
  baseUrl: string
  profile?: null | string
}

interface GatewayEntry {
  connectPromise: Promise<HermesGateway> | null
  connectionDetail: string
  connectionTarget: string
  eventUnsubscribe: (() => void) | null
  gateway: HermesGateway
  profile: string
  state: ConnectionState
  unsubscribe: (() => void) | null
}

interface GatewayRegistryConfig {
  onEvent: (event: GatewayEvent) => void
}

const gatewayEntries = new Map<string, GatewayEntry>()
let activeEntry: GatewayEntry | null = null
let registryConfig: GatewayRegistryConfig | null = null

export const gatewayState = $state<{
  activeProfile: string
  connectionState: ConnectionState
  connectionDetail: string
  connectionTarget: string
  profiles: Record<string, ConnectionState>
}>({
  activeProfile: 'default',
  connectionState: 'idle',
  connectionDetail: '',
  connectionTarget: '',
  profiles: {}
})

function normalizeProfile(profile: null | string | undefined): string {
  const value = (profile ?? '').trim()
  return value || 'default'
}

function profileFromParams(params: Record<string, unknown>): string | null {
  const profile = params.profile
  return typeof profile === 'string' && profile.trim() ? normalizeProfile(profile) : null
}

export function configureGatewayRegistry(config: GatewayRegistryConfig | null): void {
  registryConfig = config
}

function detailedError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error)
  const bridgeError = consumeLastTauriGatewaySocketError()

  if (bridgeError && bridgeError !== base) {
    return `${base}: ${bridgeError}`
  }

  return base
}

function createEntry(profile: string): GatewayEntry {
  const gateway = new HermesGateway(profile)
  const entry: GatewayEntry = {
    connectPromise: null,
    connectionDetail: '',
    connectionTarget: '',
    eventUnsubscribe: null,
    gateway,
    profile,
    state: 'idle',
    unsubscribe: null
  }

  entry.eventUnsubscribe = gateway.onEvent(event => registryConfig?.onEvent(event))

  entry.unsubscribe = gateway.onState(state => {
    entry.state = state as ConnectionState
    gatewayState.profiles = { ...gatewayState.profiles, [profile]: entry.state }

    if (activeEntry === entry) {
      gatewayState.connectionState = entry.state
    }
  })

  gatewayEntries.set(profile, entry)
  return entry
}

function entryForProfile(profile: null | string | undefined): GatewayEntry {
  const key = normalizeProfile(profile)
  return gatewayEntries.get(key) ?? createEntry(key)
}

async function resolveConnection(profile: string): Promise<ResolvedConnection> {
  try {
    return await invoke<ResolvedConnection>('resolve_connection', { profile })
  } catch {
    // Older dev harnesses/tests may not have the Tauri command registered yet.
    // Fall back to the default gateway origin so the UI can still surface the
    // bridge error instead of dying before it opens the socket shim.
    return {
      authMode: 'token',
      baseUrl: 'http://127.0.0.1:9119',
      profile
    }
  }
}

export async function ensureGatewayForProfile(profile: null | string | undefined): Promise<HermesGateway> {
  const key = normalizeProfile(profile)
  const entry = entryForProfile(key)
  activeEntry = entry
  gatewayState.activeProfile = key
  gatewayState.connectionState = entry.state
  gatewayState.connectionDetail = entry.connectionDetail
  gatewayState.connectionTarget = entry.connectionTarget

  if (entry.state === 'open') {
    gatewayState.connectionDetail = entry.connectionDetail || `Dashboard gateway ready for ${key}`
    gatewayState.connectionTarget = entry.connectionTarget
    return entry.gateway
  }

  if (entry.connectPromise) {
    return await entry.connectPromise
  }

  entry.connectPromise = (async () => {
    const connection = await resolveConnection(key)
    const baseUrl = connection.baseUrl || 'http://127.0.0.1:9119'

    entry.state = 'connecting'
    entry.connectionDetail = `Connecting ${key} to Hermes dashboard at ${baseUrl}`
    entry.connectionTarget = baseUrl
    gatewayState.connectionState = 'connecting'
    gatewayState.connectionDetail = entry.connectionDetail
    gatewayState.connectionTarget = entry.connectionTarget
    gatewayState.profiles = { ...gatewayState.profiles, [key]: 'connecting' }

    try {
      await entry.gateway.connect(baseUrl)
      entry.state = 'open'
      entry.connectionDetail = `Dashboard gateway ready for ${key}`
      gatewayState.profiles = { ...gatewayState.profiles, [key]: 'open' }
      gatewayState.connectionState = 'open'
      gatewayState.connectionDetail = entry.connectionDetail
      gatewayState.connectionTarget = entry.connectionTarget
      return entry.gateway
    } catch (error) {
      entry.state = 'error'
      entry.connectionDetail = detailedError(error)
      gatewayState.profiles = { ...gatewayState.profiles, [key]: 'error' }
      gatewayState.connectionState = 'error'
      gatewayState.connectionDetail = entry.connectionDetail
      gatewayState.connectionTarget = entry.connectionTarget
      throw error
    } finally {
      entry.connectPromise = null
    }
  })()

  return await entry.connectPromise
}

export async function connectGateway(profile = 'default'): Promise<void> {
  try {
    await ensureGatewayForProfile(profile)
  } catch {
    // ensureGatewayForProfile already stored the operator-facing detail.
  }
}

export function disconnectGateway(profile?: null | string): void {
  const keys = profile ? [normalizeProfile(profile)] : [...gatewayEntries.keys()]

  for (const key of keys) {
    const entry = gatewayEntries.get(key)
    if (!entry) continue

    entry.eventUnsubscribe?.()
    entry.eventUnsubscribe = null
    entry.unsubscribe?.()
    entry.unsubscribe = null
    entry.gateway.close()
    entry.connectPromise = null
    entry.state = 'closed'
    entry.connectionDetail = ''
    entry.connectionTarget = ''
    gatewayEntries.delete(key)
  }

  if (!profile || keys.includes(gatewayState.activeProfile)) {
    activeEntry = null
    gatewayState.activeProfile = 'default'
    gatewayState.connectionState = 'closed'
    gatewayState.connectionDetail = ''
    gatewayState.connectionTarget = ''
  }

  const states: Record<string, ConnectionState> = {}
  for (const [key, entry] of gatewayEntries) {
    states[key] = entry.state
  }
  gatewayState.profiles = states
}

export async function requestGateway<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const targetProfile = profileFromParams(params)
  const entry = targetProfile
    ? entryForProfile(targetProfile)
    : (activeEntry ?? entryForProfile(gatewayState.activeProfile))

  if (entry.state !== 'open' && entry.connectPromise) {
    await entry.connectPromise
  }

  if (entry.state !== 'open') {
    throw new Error(
      entry.state === 'connecting'
        ? 'Hermes gateway is still connecting — please wait'
        : entry.state === 'error'
          ? `Hermes gateway encountered an error: ${entry.connectionDetail || gatewayState.connectionDetail}`
          : 'Hermes gateway is not connected'
    )
  }

  return entry.gateway.request<T>(method, params)
}
