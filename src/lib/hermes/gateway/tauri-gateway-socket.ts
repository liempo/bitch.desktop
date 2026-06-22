import { invokeTauriCommand, listenTauriEvent, type UnlistenFn } from '$lib/platform'

type SocketEventName = 'close' | 'error' | 'message' | 'open'
type SocketListener = EventListenerOrEventListenerObject

interface WsEventPayload {
  connectionId: string
}

interface WsMessagePayload extends WsEventPayload {
  message: string
}

interface WsErrorPayload extends WsEventPayload {
  message: string
}

interface WsClosePayload extends WsEventPayload {
  reason: string
}

let lastBridgeError: string | null = null

const SOCKET_EVENT_NAMES = new Set<SocketEventName>(['close', 'error', 'message', 'open'])

function isSocketEventName(type: string): type is SocketEventName {
  return SOCKET_EVENT_NAMES.has(type as SocketEventName)
}

function createConnectionId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.()

  if (randomUuid) {
    return randomUuid
  }

  return `tauri-ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function browserLog(level: string, message: string): void {
  const text = `[Hermes gateway proxy] ${message}`

  if (level === 'error') {
    console.error(text)
  } else if (level === 'warn') {
    console.warn(text)
  } else {
    console.debug(text)
  }
}

function rememberBridgeError(message: string): void {
  lastBridgeError = message
  browserLog('error', message)
}

function createErrorEvent(message: string): Event {
  if (typeof ErrorEvent === 'function') {
    return new ErrorEvent('error', { message })
  }

  const event = new Event('error')
  Object.defineProperty(event, 'message', { value: message })
  return event
}

function createCloseEvent(reason: string): Event {
  if (typeof CloseEvent === 'function') {
    return new CloseEvent('close', { reason })
  }

  const event = new Event('close')
  Object.defineProperty(event, 'reason', { value: reason })
  return event
}

class TauriGatewaySocket {
  readonly binaryType = 'blob'
  readonly bufferedAmount = 0
  readonly extensions = ''
  readonly protocol = ''
  readonly url: string

  readyState: WebSocket['readyState'] = WebSocket.CONNECTING

  private readonly connectionId = createConnectionId()
  private readonly listeners = new Map<SocketEventName, Set<SocketListener>>()
  private readonly profile: string
  private unlisteners: UnlistenFn[] = []

  constructor(url: string, profile = 'default') {
    this.profile = profile
    this.url = url
    browserLog('debug', `creating Tauri socket shim for ${url} (profile=${profile})`)
    void this.start()
  }

  addEventListener(type: string, listener: SocketListener | null): void {
    if (!listener || !isSocketEventName(type)) {
      return
    }

    let listeners = this.listeners.get(type)

    if (!listeners) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }

    listeners.add(listener)
  }

  removeEventListener(type: string, listener: SocketListener | null): void {
    if (!listener || !isSocketEventName(type)) {
      return
    }

    this.listeners.get(type)?.delete(listener)
  }

  send(data: unknown): void {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('Hermes gateway proxy is not open')
    }

    const message = String(data)
    browserLog('debug', `sending renderer frame through Tauri bridge (${message.length} bytes)`)

    void invokeTauriCommand('send_ws_message', {
      connectionId: this.connectionId,
      message
    }).catch(error => this.handleBridgeError(error))
  }

  close(): void {
    if (this.readyState === WebSocket.CLOSED || this.readyState === WebSocket.CLOSING) {
      return
    }

    this.readyState = WebSocket.CLOSING
    browserLog('debug', 'closing Tauri socket shim')

    void invokeTauriCommand('close_ws', { connectionId: this.connectionId })
      .catch(() => undefined)
      .finally(() => {
        this.readyState = WebSocket.CLOSED
        this.cleanup()
      })
  }

  private async start(): Promise<void> {
    try {
      browserLog('debug', 'registering Tauri WebSocket event listeners')
      this.unlisteners = await Promise.all([
        listenTauriEvent<WsEventPayload>('ws-open', event => {
          if (this.isCurrent(event.payload)) {
            this.handleOpen()
          }
        }),
        listenTauriEvent<WsMessagePayload>('ws-message', event => {
          if (this.isCurrent(event.payload)) {
            this.handleMessage(event.payload.message)
          }
        }),
        listenTauriEvent<WsErrorPayload>('ws-error', event => {
          if (this.isCurrent(event.payload)) {
            this.handleBridgeError(event.payload.message)
          }
        }),
        listenTauriEvent<WsClosePayload>('ws-close', event => {
          if (this.isCurrent(event.payload)) {
            this.handleBridgeClose(event.payload.reason)
          }
        })
      ])

      if (this.readyState !== WebSocket.CONNECTING) {
        this.cleanup()
        return
      }

      browserLog('debug', `invoking connect_ws for profile=${this.profile}`)
      await invokeTauriCommand('connect_ws', { connectionId: this.connectionId, profile: this.profile })
    } catch (error) {
      this.handleBridgeError(error)
    }
  }

  private isCurrent(payload: WsEventPayload | null | undefined): boolean {
    return payload?.connectionId === this.connectionId
  }

  private handleOpen(): void {
    if (this.readyState !== WebSocket.CONNECTING) {
      return
    }

    this.readyState = WebSocket.OPEN
    browserLog('debug', 'Tauri socket shim opened')
    this.dispatch('open', new Event('open'))
  }

  private handleMessage(message: string): void {
    if (this.readyState !== WebSocket.OPEN) {
      return
    }

    browserLog('debug', `received bridge frame (${message.length} bytes)`)
    this.dispatch('message', new MessageEvent('message', { data: message }))
  }

  private handleBridgeError(error: unknown): void {
    if (this.readyState === WebSocket.CLOSED) {
      return
    }

    const message = errorMessage(error)
    const wasConnecting = this.readyState === WebSocket.CONNECTING
    this.readyState = WebSocket.CLOSED
    rememberBridgeError(message)
    this.dispatch('error', createErrorEvent(message))

    if (!wasConnecting) {
      this.dispatch('close', createCloseEvent(message))
    }

    this.cleanup()
  }

  private handleBridgeClose(reason: string): void {
    if (this.readyState === WebSocket.CLOSED) {
      return
    }

    this.readyState = WebSocket.CLOSED
    browserLog('debug', `Tauri socket shim closed: ${reason}`)
    this.dispatch('close', createCloseEvent(reason))
    this.cleanup()
  }

  private dispatch(type: SocketEventName, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(this, event)
      } else {
        listener.handleEvent(event)
      }
    }
  }

  private cleanup(): void {
    const unlisteners = this.unlisteners
    this.unlisteners = []

    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}

export function createTauriGatewaySocket(url: string, profile = 'default'): WebSocket {
  return new TauriGatewaySocket(url, profile) as unknown as WebSocket
}

export function consumeLastTauriGatewaySocketError(): string | null {
  const message = lastBridgeError
  lastBridgeError = null
  return message
}
