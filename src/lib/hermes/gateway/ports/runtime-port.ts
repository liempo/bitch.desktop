import type { ConnectionState, GatewayEvent, GatewayEventName } from '../json-rpc-gateway'

export interface GatewayRuntimePort {
  close(): void
  connect(wsUrl: string): Promise<void>
  on<P = unknown>(type: GatewayEventName, handler: (event: GatewayEvent<P>) => void): () => void
  onEvent(handler: (event: GatewayEvent) => void): () => void
  onState(handler: (state: ConnectionState) => void): () => void
  request<T>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>
}

export interface PromptSubmissionPort {
  submitPrompt(payload: string, options?: Record<string, unknown>): Promise<unknown>
}
