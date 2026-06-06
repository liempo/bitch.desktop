import { HermesGateway } from '$lib/gateway/hermes'
import { consumeLastTauriGatewaySocketError } from '$lib/gateway/tauri-gateway-socket'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

/* ------------------------------------------------------------------ */
/*  Reactive state                                                     */
/* ------------------------------------------------------------------ */

let _gateway: HermesGateway | null = null
let _unsubState: (() => void) | null = null

export const gatewayState = $state<{
  connectionState: ConnectionState
  connectionDetail: string
}>({
  connectionState: 'idle',
  connectionDetail: ''
})

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

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

/** Connect the gateway and start listening for state events. */
export async function connectGateway(): Promise<void> {
  const gateway = getGateway()
  const baseUrl = import.meta.env.VITE_BITCH_GATEWAY_URL ?? 'http://127.0.0.1:9119'

  gatewayState.connectionState = 'connecting'
  gatewayState.connectionDetail = `Connecting to Hermes dashboard at ${baseUrl}`

  _unsubState = gateway.onState(state => {
    gatewayState.connectionState = state as ConnectionState
  })

  try {
    await gateway.connect(baseUrl)
    gatewayState.connectionState = 'open'
    gatewayState.connectionDetail = 'Dashboard gateway transport ready'
  } catch (error) {
    gatewayState.connectionState = 'error'
    gatewayState.connectionDetail = detailedError(error)
  }
}

/** Disconnect the gateway and tear down all subscriptions. */
export function disconnectGateway(): void {
  _unsubState?.()
  _unsubState = null
  _gateway?.close()
  _gateway = null
  gatewayState.connectionState = 'closed'
  gatewayState.connectionDetail = ''
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
