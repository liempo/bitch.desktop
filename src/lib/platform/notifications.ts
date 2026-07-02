const MAX_NOTIFICATION_BODY_LENGTH = 160

export interface MacosNotificationContent {
  body: string
  sessionId?: string | null
  title: string
}

interface MacosNotificationOptions {
  autoCancel?: boolean
  body: string
  extra?: Record<string, unknown>
  group?: string
  title: string
}

interface MacosNotificationBackend {
  isPermissionGranted: () => Promise<boolean>
  requestPermission: () => Promise<string>
  sendNotification: (notification: MacosNotificationOptions) => Promise<void> | void
}

interface MacosNotificationActionListener {
  unregister?: () => Promise<void> | void
}

export type MacosNotificationActionUnlisten = () => Promise<void> | void

interface MacosNotificationActionBackend {
  onAction: (
    handler: (notification: MacosNotificationActionPayload) => void
  ) => Promise<MacosNotificationActionListener>
}

export interface MacosNotificationRuntime {
  backend?: MacosNotificationBackend
  isMacOs?: boolean
  isWindowFocused?: () => boolean
}

export interface MacosNotificationClickRuntime {
  backend?: MacosNotificationActionBackend
  isMacOs?: boolean
  isTauriRuntime?: boolean
}

export interface MacosNotificationActionPayload {
  extra?: Record<string, unknown>
}

export interface AssistantCompleteNotificationInput {
  error?: string | null
  sessionId?: string | null
  text?: string | null
}

function compactNotificationBody(text: string | null | undefined, fallback: string): string {
  const compacted = (text ?? '').replace(/\s+/g, ' ').trim() || fallback

  if (compacted.length <= MAX_NOTIFICATION_BODY_LENGTH) {
    return compacted
  }

  return `${compacted.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1).trimEnd()}…`
}

function isMacOsRuntime(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const platform = navigator.platform || ''
  const userAgent = navigator.userAgent || ''

  return /Mac|Macintosh|MacIntel|MacPPC|Mac68K/i.test(`${platform} ${userAgent}`)
}

function isBrowserWindowFocused(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  return document.visibilityState === 'visible' && document.hasFocus()
}

async function defaultNotificationBackend(): Promise<MacosNotificationBackend> {
  const notification = await import('@tauri-apps/plugin-notification')

  return {
    isPermissionGranted: notification.isPermissionGranted,
    requestPermission: notification.requestPermission,
    sendNotification: notification.sendNotification
  }
}

async function defaultNotificationActionBackend(): Promise<MacosNotificationActionBackend> {
  const notification = await import('@tauri-apps/plugin-notification')

  return {
    onAction: notification.onAction
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function notificationOptions(notification: MacosNotificationContent): MacosNotificationOptions {
  const sessionId = notification.sessionId?.trim()
  const options: MacosNotificationOptions = {
    body: notification.body,
    title: notification.title
  }

  if (sessionId) {
    options.autoCancel = true
    options.extra = { bitchSessionId: sessionId }
    options.group = `session:${sessionId}`
  }

  return options
}

export function shouldSendMacosNotification(input: { isMacOs: boolean; isWindowFocused: boolean }): boolean {
  return input.isMacOs && !input.isWindowFocused
}

export function buildAssistantCompleteNotification(
  input: AssistantCompleteNotificationInput
): MacosNotificationContent {
  if (input.error?.trim()) {
    return {
      title: 'BITCH needs attention',
      body: compactNotificationBody(input.error, 'The run completed with an error.'),
      sessionId: input.sessionId
    }
  }

  return {
    title: 'BITCH finished',
    body: compactNotificationBody(input.text, 'Agent response completed.'),
    sessionId: input.sessionId
  }
}

export function buildInputNeededNotification(
  promptText: string | null | undefined,
  sessionId?: string | null
): MacosNotificationContent {
  return {
    title: 'BITCH needs input',
    body: compactNotificationBody(promptText, 'The agent is waiting for your response.'),
    sessionId
  }
}

export async function sendMacosNotification(
  notification: MacosNotificationContent,
  runtime: MacosNotificationRuntime = {}
): Promise<void> {
  const isMacOs = runtime.isMacOs ?? isMacOsRuntime()
  const isWindowFocused = runtime.isWindowFocused?.() ?? isBrowserWindowFocused()

  if (!shouldSendMacosNotification({ isMacOs, isWindowFocused })) {
    return
  }

  const backend = runtime.backend ?? (await defaultNotificationBackend())
  const permissionGranted = await backend.isPermissionGranted()
  const permission = permissionGranted ? 'granted' : await backend.requestPermission()

  if (permission !== 'granted') {
    return
  }

  await backend.sendNotification(notificationOptions(notification))
}

export function sessionIdFromNotificationAction(notification: MacosNotificationActionPayload): string | null {
  const extra = notification.extra
  const sessionId = extra?.bitchSessionId

  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null
}

export async function installMacosNotificationClickHandler(
  onSessionClick: (sessionId: string) => void,
  runtime: MacosNotificationClickRuntime = {}
): Promise<MacosNotificationActionUnlisten> {
  const isMacOs = runtime.isMacOs ?? isMacOsRuntime()
  const tauriRuntime = runtime.isTauriRuntime ?? isTauriRuntime()

  if (!isMacOs || !tauriRuntime) {
    return () => undefined
  }

  const backend = runtime.backend ?? (await defaultNotificationActionBackend())
  const listener = await backend.onAction(notification => {
    const sessionId = sessionIdFromNotificationAction(notification)

    if (sessionId) {
      onSessionClick(sessionId)
    }
  })

  return () => listener.unregister?.()
}
