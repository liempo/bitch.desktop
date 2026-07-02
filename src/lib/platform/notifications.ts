import { readNamespacedStorageItem, writeNamespacedStorageItem } from '$lib/storage/namespace'

const MAX_NOTIFICATION_BODY_LENGTH = 160
export const NOTIFICATION_PREFERENCES_STORAGE_SUFFIX = 'notificationPreferences.v1'

export const NOTIFICATION_PREFERENCE_ITEMS = [
  {
    category: 'runCompleted',
    label: 'Run completed',
    description: 'Agent runs that finish cleanly route back to the relevant AGENT session.'
  },
  {
    category: 'runFailed',
    label: 'Run failed',
    description: 'Agent runs that end with provider, gateway, or execution errors.'
  },
  {
    category: 'approvalNeeded',
    label: 'Approval needed',
    description: 'Approval, sudo, and secret prompts that need operator action.'
  },
  {
    category: 'clarifyNeeded',
    label: 'Clarify needed',
    description: 'Clarification prompts that are waiting on an operator answer.'
  },
  {
    category: 'cronFailed',
    label: 'Cron failed',
    description: 'Cron job failures route to the Cron page and target job when the notification carries a job id.'
  },
  {
    category: 'kanbanUpdate',
    label: 'Kanban update',
    description: 'Kanban card updates route to the Kanban page and target card when payload data exists.'
  }
] as const

export type NotificationCategory = (typeof NOTIFICATION_PREFERENCE_ITEMS)[number]['category']
export type NotificationPreferences = Record<NotificationCategory, boolean>

export type NotificationRouteTarget =
  | { page: 'agent'; sessionId?: null | string }
  | { jobId?: null | string; page: 'cron'; profile?: null | string }
  | { board?: null | string; page: 'kanban'; profile?: null | string; taskId?: null | string; tenant?: null | string }

export interface MacosNotificationContent {
  body: string
  category?: NotificationCategory
  route?: NotificationRouteTarget | null
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
  storage?: Storage
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

export interface CronFailedNotificationInput {
  error?: string | null
  jobId?: string | null
  jobName?: string | null
  profile?: string | null
}

export interface KanbanUpdateNotificationInput {
  board?: string | null
  profile?: string | null
  status?: string | null
  taskId?: string | null
  taskTitle?: string | null
  tenant?: string | null
}

const NOTIFICATION_CATEGORIES = NOTIFICATION_PREFERENCE_ITEMS.map(item => item.category) as NotificationCategory[]

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.freeze(
  Object.fromEntries(NOTIFICATION_CATEGORIES.map(category => [category, true])) as NotificationPreferences
)

function compactNotificationBody(text: string | null | undefined, fallback: string): string {
  const compacted = (text ?? '').replace(/\s+/g, ' ').trim() || fallback

  if (compacted.length <= MAX_NOTIFICATION_BODY_LENGTH) {
    return compacted
  }

  return `${compacted.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1).trimEnd()}…`
}

function clean(value: null | string | undefined): string {
  return value?.trim() ?? ''
}

function ownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && NOTIFICATION_CATEGORIES.includes(value as NotificationCategory)
}

function defaultNotificationPreferences(): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES }
}

function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const input = ownRecord(value)
  const preferences = defaultNotificationPreferences()

  if (!input) return preferences

  for (const category of NOTIFICATION_CATEGORIES) {
    if (typeof input[category] === 'boolean') {
      preferences[category] = input[category]
    }
  }

  return preferences
}

function parseNotificationPreferences(raw: null | string): NotificationPreferences {
  if (!raw) return defaultNotificationPreferences()

  try {
    return normalizeNotificationPreferences(JSON.parse(raw))
  } catch {
    return defaultNotificationPreferences()
  }
}

export function loadNotificationPreferences(storage?: Storage): NotificationPreferences {
  return parseNotificationPreferences(readNamespacedStorageItem(NOTIFICATION_PREFERENCES_STORAGE_SUFFIX, storage))
}

export function persistNotificationPreferences(
  preferences: Partial<NotificationPreferences>,
  storage?: Storage
): NotificationPreferences {
  const normalized = normalizeNotificationPreferences(preferences)
  writeNamespacedStorageItem(NOTIFICATION_PREFERENCES_STORAGE_SUFFIX, JSON.stringify(normalized), storage)
  return normalized
}

export function setNotificationPreference(
  category: NotificationCategory,
  enabled: boolean,
  storage?: Storage
): NotificationPreferences {
  const next = {
    ...loadNotificationPreferences(storage),
    [category]: enabled
  }

  return persistNotificationPreferences(next, storage)
}

export function isNotificationCategoryEnabled(category: NotificationCategory, storage?: Storage): boolean {
  return loadNotificationPreferences(storage)[category] !== false
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

function cleanRouteTarget(target: NotificationRouteTarget | null | undefined): NotificationRouteTarget | null {
  if (!target) return null

  if (target.page === 'agent') {
    const sessionId = clean(target.sessionId)
    return sessionId ? { page: 'agent', sessionId } : { page: 'agent' }
  }

  if (target.page === 'cron') {
    const jobId = clean(target.jobId)
    const profile = clean(target.profile)
    return { ...(jobId ? { jobId } : {}), page: 'cron', ...(profile ? { profile } : {}) }
  }

  if (target.page === 'kanban') {
    const board = clean(target.board)
    const profile = clean(target.profile)
    const taskId = clean(target.taskId)
    const tenant = clean(target.tenant)
    return {
      ...(board ? { board } : {}),
      page: 'kanban',
      ...(profile ? { profile } : {}),
      ...(taskId ? { taskId } : {}),
      ...(tenant ? { tenant } : {})
    }
  }

  return null
}

function routeTargetFromUnknown(value: unknown): NotificationRouteTarget | null {
  const input = ownRecord(value)
  if (!input) return null

  if (input.page === 'agent') {
    return cleanRouteTarget({ page: 'agent', sessionId: typeof input.sessionId === 'string' ? input.sessionId : null })
  }

  if (input.page === 'cron') {
    return cleanRouteTarget({
      jobId: typeof input.jobId === 'string' ? input.jobId : null,
      page: 'cron',
      profile: typeof input.profile === 'string' ? input.profile : null
    })
  }

  if (input.page === 'kanban') {
    return cleanRouteTarget({
      board: typeof input.board === 'string' ? input.board : null,
      page: 'kanban',
      profile: typeof input.profile === 'string' ? input.profile : null,
      taskId: typeof input.taskId === 'string' ? input.taskId : null,
      tenant: typeof input.tenant === 'string' ? input.tenant : null
    })
  }

  return null
}

function defaultRouteForCategory(category: NotificationCategory): NotificationRouteTarget {
  switch (category) {
    case 'cronFailed':
      return { page: 'cron' }
    case 'kanbanUpdate':
      return { page: 'kanban' }
    case 'approvalNeeded':
    case 'clarifyNeeded':
    case 'runFailed':
    case 'runCompleted':
    default:
      return { page: 'agent' }
  }
}

function notificationCategory(notification: MacosNotificationContent): NotificationCategory {
  return notification.category ?? 'runCompleted'
}

function notificationRoute(
  notification: MacosNotificationContent,
  category: NotificationCategory
): NotificationRouteTarget {
  const route = cleanRouteTarget(notification.route)
  if (route) return route

  const sessionId = clean(notification.sessionId)
  if (sessionId) return { page: 'agent', sessionId }

  return defaultRouteForCategory(category)
}

function notificationGroup(route: NotificationRouteTarget): string | undefined {
  if (route.page === 'agent' && route.sessionId) return `session:${route.sessionId}`
  if (route.page === 'cron' && route.jobId) return `cron:${route.profile ?? 'default'}:${route.jobId}`
  if (route.page === 'kanban' && route.taskId) return `kanban:${route.board ?? 'default'}:${route.taskId}`
  return undefined
}

function notificationOptions(notification: MacosNotificationContent): MacosNotificationOptions {
  const category = notificationCategory(notification)
  const route = notificationRoute(notification, category)
  const sessionId = route.page === 'agent' ? clean(route.sessionId) : ''
  const options: MacosNotificationOptions = {
    autoCancel: true,
    body: notification.body,
    extra: {
      bitchNotificationCategory: category,
      bitchNotificationRoute: route,
      ...(sessionId ? { bitchSessionId: sessionId } : {})
    },
    title: notification.title
  }
  const group = notificationGroup(route)

  if (group) options.group = group

  return options
}

export function shouldSendMacosNotification(input: { isMacOs: boolean; isWindowFocused: boolean }): boolean {
  return input.isMacOs && !input.isWindowFocused
}

export function buildAssistantCompleteNotification(
  input: AssistantCompleteNotificationInput
): MacosNotificationContent {
  const sessionId = clean(input.sessionId)
  if (input.error?.trim()) {
    return {
      title: 'BITCH needs attention',
      body: compactNotificationBody(input.error, 'The run completed with an error.'),
      category: 'runFailed',
      route: sessionId ? { page: 'agent', sessionId } : { page: 'agent' },
      sessionId: input.sessionId
    }
  }

  return {
    title: 'BITCH finished',
    body: compactNotificationBody(input.text, 'Agent response completed.'),
    category: 'runCompleted',
    route: sessionId ? { page: 'agent', sessionId } : { page: 'agent' },
    sessionId: input.sessionId
  }
}

export function buildInputNeededNotification(
  promptText: string | null | undefined,
  sessionId?: string | null,
  category: Extract<NotificationCategory, 'approvalNeeded' | 'clarifyNeeded'> = 'approvalNeeded'
): MacosNotificationContent {
  const cleanSessionId = clean(sessionId)
  return {
    title: 'BITCH needs input',
    body: compactNotificationBody(promptText, 'The agent is waiting for your response.'),
    category,
    route: cleanSessionId ? { page: 'agent', sessionId: cleanSessionId } : { page: 'agent' },
    sessionId
  }
}

export function buildCronFailedNotification(input: CronFailedNotificationInput): MacosNotificationContent {
  const label = clean(input.jobName) || clean(input.jobId) || 'Cron job'
  const error = compactNotificationBody(input.error, 'The job failed.')
  return {
    title: 'BITCH cron failed',
    body: compactNotificationBody(`${label}: ${error}`, 'Cron job failed.'),
    category: 'cronFailed',
    route: {
      page: 'cron',
      ...(clean(input.jobId) ? { jobId: clean(input.jobId) } : {}),
      ...(clean(input.profile) ? { profile: clean(input.profile) } : {})
    }
  }
}

export function buildKanbanUpdateNotification(input: KanbanUpdateNotificationInput): MacosNotificationContent {
  const label = clean(input.taskTitle) || clean(input.taskId) || 'Kanban card'
  const status = clean(input.status)
  return {
    title: 'BITCH Kanban update',
    body: compactNotificationBody(status ? `${label} moved to ${status}` : `${label} updated`, 'Kanban card updated.'),
    category: 'kanbanUpdate',
    route: {
      ...(clean(input.board) ? { board: clean(input.board) } : {}),
      page: 'kanban',
      ...(clean(input.profile) ? { profile: clean(input.profile) } : {}),
      ...(clean(input.taskId) ? { taskId: clean(input.taskId) } : {}),
      ...(clean(input.tenant) ? { tenant: clean(input.tenant) } : {})
    }
  }
}

export async function sendMacosNotification(
  notification: MacosNotificationContent,
  runtime: MacosNotificationRuntime = {}
): Promise<void> {
  const category = notificationCategory(notification)
  if (!isNotificationCategoryEnabled(category, runtime.storage)) {
    return
  }

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

  if (typeof sessionId === 'string' && sessionId.trim()) return sessionId.trim()

  const route = routeTargetFromNotificationAction(notification)
  return route?.page === 'agent' && route.sessionId ? route.sessionId : null
}

export function routeTargetFromNotificationAction(
  notification: MacosNotificationActionPayload
): NotificationRouteTarget | null {
  const extra = notification.extra
  const route = routeTargetFromUnknown(extra?.bitchNotificationRoute)
  if (route) return route

  const sessionId = extra?.bitchSessionId
  if (typeof sessionId === 'string' && sessionId.trim()) {
    return { page: 'agent', sessionId: sessionId.trim() }
  }

  const category = extra?.bitchNotificationCategory
  return isNotificationCategory(category) ? defaultRouteForCategory(category) : null
}

export async function installMacosNotificationClickHandler(
  onNotificationClick: (target: NotificationRouteTarget) => void,
  runtime: MacosNotificationClickRuntime = {}
): Promise<MacosNotificationActionUnlisten> {
  const isMacOs = runtime.isMacOs ?? isMacOsRuntime()
  const tauriRuntime = runtime.isTauriRuntime ?? isTauriRuntime()

  if (!isMacOs || !tauriRuntime) {
    return () => undefined
  }

  const backend = runtime.backend ?? (await defaultNotificationActionBackend())
  const listener = await backend.onAction(notification => {
    const target = routeTargetFromNotificationAction(notification)

    if (target) {
      onNotificationClick(target)
    }
  })

  return () => listener.unregister?.()
}
