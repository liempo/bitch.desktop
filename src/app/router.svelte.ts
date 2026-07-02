import type { NotificationRouteTarget } from '$lib/platform/notifications'

export type AppPage = 'main' | 'agent' | 'assets' | 'calendar' | 'cron' | 'kanban' | 'settings'

export interface AppRouterState {
  page: AppPage
}

interface CronRouteTarget {
  jobId?: null | string
  profile?: null | string
}

interface KanbanRouteTarget {
  board?: null | string
  profile?: null | string
  taskId?: null | string
  tenant?: null | string
}

export const appRouterState = $state<AppRouterState>(parseAppHash(currentHash()))

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', syncRoute)
}

function currentHash(): string {
  return typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/'
}

function syncRoute(): void {
  Object.assign(appRouterState, parseAppHash(currentHash()))
}

function routePath(hash: string): string {
  return (hash || '/').split('?')[0] || '/'
}

export function parseAppHash(hash: string): AppRouterState {
  const path = routePath(hash)

  if (path === '/' || path === '/main') {
    return { page: 'main' }
  }

  if (path === '/agent' || path.startsWith('/agent/') || path === '/cmd' || path.startsWith('/cmd/')) {
    return { page: 'agent' }
  }

  if (path === '/assets' || path === '/files') {
    return { page: 'assets' }
  }

  if (path === '/calendar') {
    return { page: 'calendar' }
  }

  if (path === '/cron' || path.startsWith('/cron/')) {
    return { page: 'cron' }
  }

  if (path === '/kanban' || path.startsWith('/kanban/')) {
    return { page: 'kanban' }
  }

  if (path === '/settings') {
    return { page: 'settings' }
  }

  return { page: 'main' }
}

function clean(value: null | string | undefined): string {
  return value?.trim() ?? ''
}

function routeWithQuery(path: string, params: [string, null | string | undefined][]): string {
  const query = new URLSearchParams()

  for (const [key, value] of params) {
    const trimmed = clean(value)
    if (trimmed) query.set(key, trimmed)
  }

  const encoded = query.toString()
  return encoded ? `${path}?${encoded}` : path
}

export function mainRoute(): string {
  return '/main'
}

export function agentRoute(sessionId?: null | string): string {
  const id = clean(sessionId)
  return id ? `/agent/${encodeURIComponent(id)}` : '/agent'
}

export function assetsRoute(): string {
  return '/assets'
}

export function calendarRoute(): string {
  return '/calendar'
}

export function cronRoute(target?: null | string | CronRouteTarget): string {
  const routeTarget = typeof target === 'string' ? { jobId: target } : (target ?? {})
  const jobId = clean(routeTarget.jobId)
  const path = jobId ? `/cron/${encodeURIComponent(jobId)}` : '/cron'
  return routeWithQuery(path, [['profile', routeTarget.profile]])
}

export function kanbanRoute(target?: null | string | KanbanRouteTarget): string {
  const routeTarget = typeof target === 'string' ? { taskId: target } : (target ?? {})
  const taskId = clean(routeTarget.taskId)
  const path = taskId ? `/kanban/${encodeURIComponent(taskId)}` : '/kanban'
  return routeWithQuery(path, [
    ['board', routeTarget.board],
    ['profile', routeTarget.profile],
    ['tenant', routeTarget.tenant]
  ])
}

export function settingsRoute(): string {
  return '/settings'
}

export function notificationRouteHash(target: NotificationRouteTarget | null | undefined): string {
  if (target?.page === 'cron') {
    return cronRoute({ jobId: target.jobId, profile: target.profile })
  }

  if (target?.page === 'kanban') {
    return kanbanRoute({ board: target.board, profile: target.profile, taskId: target.taskId, tenant: target.tenant })
  }

  return agentRoute(target?.page === 'agent' ? target.sessionId : null)
}
