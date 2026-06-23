const MAX_NOTIFICATION_BODY_LENGTH = 160

export interface MacosNotificationContent {
  body: string
  title: string
}

interface MacosNotificationBackend {
  isPermissionGranted: () => Promise<boolean>
  requestPermission: () => Promise<string>
  sendNotification: (notification: MacosNotificationContent) => Promise<void> | void
}

export interface MacosNotificationRuntime {
  backend?: MacosNotificationBackend
  isMacOs?: boolean
  isWindowFocused?: () => boolean
}

export interface AssistantCompleteNotificationInput {
  error?: string | null
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

export function shouldSendMacosNotification(input: { isMacOs: boolean; isWindowFocused: boolean }): boolean {
  return input.isMacOs && !input.isWindowFocused
}

export function buildAssistantCompleteNotification(
  input: AssistantCompleteNotificationInput
): MacosNotificationContent {
  if (input.error?.trim()) {
    return {
      title: 'BITCH needs attention',
      body: compactNotificationBody(input.error, 'The run completed with an error.')
    }
  }

  return {
    title: 'BITCH finished',
    body: compactNotificationBody(input.text, 'Agent response completed.')
  }
}

export function buildInputNeededNotification(promptText: string | null | undefined): MacosNotificationContent {
  return {
    title: 'BITCH needs input',
    body: compactNotificationBody(promptText, 'The agent is waiting for your response.')
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

  await backend.sendNotification(notification)
}
