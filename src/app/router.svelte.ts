export type AppPage = 'main' | 'agent' | 'assets' | 'calendar' | 'cron' | 'kanban' | 'settings'

export interface AppRouterState {
  page: AppPage
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

export function parseAppHash(hash: string): AppRouterState {
  const path = hash || '/'

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

  if (path === '/cron') {
    return { page: 'cron' }
  }

  if (path === '/kanban') {
    return { page: 'kanban' }
  }

  if (path === '/settings') {
    return { page: 'settings' }
  }

  return { page: 'main' }
}

export function mainRoute(): string {
  return '/main'
}

export function agentRoute(sessionId?: null | string): string {
  const id = sessionId?.trim()
  return id ? `/agent/${encodeURIComponent(id)}` : '/agent'
}

export function assetsRoute(): string {
  return '/assets'
}

export function calendarRoute(): string {
  return '/calendar'
}

export function cronRoute(): string {
  return '/cron'
}

export function kanbanRoute(): string {
  return '/kanban'
}

export function settingsRoute(): string {
  return '/settings'
}
