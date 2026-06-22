import { JsonRpcGatewayClient } from './json-rpc-gateway'
import { createTauriGatewaySocket } from './tauri-gateway-socket'

const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 30_000

export class HermesGateway extends JsonRpcGatewayClient {
  readonly profile: string

  constructor(profile = 'default') {
    super({
      closedErrorMessage: 'Hermes gateway connection closed',
      connectErrorMessage: 'Could not connect to Hermes gateway',
      createRequestId: nextId => nextId,
      notConnectedErrorMessage: 'Hermes gateway is not connected',
      requestTimeoutMs: DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
      socketFactory: url => createTauriGatewaySocket(url, profile)
    })
    this.profile = profile
  }
}
