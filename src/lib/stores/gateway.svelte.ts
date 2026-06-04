import { HermesGateway } from '$lib/hermes'
import { consumeLastTauriGatewaySocketError, listenToTauriGatewaySocketLogs } from '$lib/tauri-gateway-socket'
import type { GatewaySocketLog } from '$lib/tauri-gateway-socket'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface UiGatewayLog extends GatewaySocketLog {
  at: string
}

/* ------------------------------------------------------------------ */
/*  Reactive state                                                     */
/* ------------------------------------------------------------------ */

let _gateway: HermesGateway | null = null
let _unlistenLogs: (() => void) | null = null
let _unsubState: (() => void) | null = null

export const gatewayState = $state<{
  connectionState: ConnectionState
  connectionDetail: string
  logs: UiGatewayLog[]
}>({
  connectionState: 'idle',
  connectionDetail: '',
  logs: []
})

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function appendLog(log: GatewaySocketLog): void {
  gatewayState.logs.push({ ...log, at: new Date().toLocaleTimeString() })
}

function detailedError(error: unknown): string {
  const base = error instanceof Error ? error.message : String(error)
  const bridgeError = consumeLastTauriGatewaySocketError()

  if (bridgeError && bridgeError !== base) {
    return `${base}: ${bridgeError}`
  }

  return base
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/** Returns the singleton HermesGateway. Creates it on first call. */
export function getGateway(): HermesGateway {
  if (!_gateway) {
    _gateway = new HermesGateway()
  }
  return _gateway
}

/** Connect the gateway and start listening for state/log events. */
export async function connectGateway(): Promise<void> {
  const gateway = getGateway()
  const baseUrl = import.meta.env.VITE_BITCH_GATEWAY_URL ?? 'http://127.0.0.1:9119'

  gatewayState.connectionState = 'connecting'
  gatewayState.connectionDetail = `Connecting to Hermes dashboard at ${baseUrl}`

  /* Subscribe to state transitions */
  _unsubState = gateway.onState(state => {
    gatewayState.connectionState = state as ConnectionState
  })

  /* Subscribe to Tauri bridge logs */
  try {
    _unlistenLogs = await listenToTauriGatewaySocketLogs(log => {
      appendLog(log)
    })
  } catch {
    /* log listener is optional */
  }

  /* Connect */
  try {
    await gateway.connect(baseUrl)
    gatewayState.connectionState = 'open'
    gatewayState.connectionDetail = 'Dashboard gateway transport ready'
    appendLog({
      connectionId: 'renderer',
      level: 'info',
      message: gatewayState.connectionDetail
    })
  } catch (error) {
    gatewayState.connectionState = 'error'
    gatewayState.connectionDetail = detailedError(error)
    appendLog({
      connectionId: 'renderer',
      level: 'error',
      message: gatewayState.connectionDetail
    })
  }
}

/** Disconnect the gateway and tear down all subscriptions. */
export function disconnectGateway(): void {
  _unsubState?.()
  _unsubState = null
  _unlistenLogs?.()
  _unlistenLogs = null
  _gateway?.close()
  _gateway = null
  gatewayState.connectionState = 'closed'
  gatewayState.connectionDetail = ''
}

/** Clear the in-memory log buffer. */
export function clearLogs(): void {
  gatewayState.logs.length = 0
}

/**
 * Thin wrapper around `gateway.request` with a friendly error when the
 * gateway is not connected (mirrors upstream `use-gateway-request`).
 */
export async function requestGateway<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const gateway = _gateway

  if (!gateway) {
    throw new Error('Hermes gateway is not initialised')
  }

  if (gatewayState.connectionState !== 'open') {
    throw new Error(
      gatewayState.connectionState === 'connecting'
        ? 'Hermes gateway is still connecting — please wait'
        : gatewayState.connectionState === 'error'
          ? `Hermes gateway encountered an error: ${gatewayState.connectionDetail}`
          : 'Hermes gateway is not connected'
    )
  }

  return gateway.request<T>(method, params)
}
