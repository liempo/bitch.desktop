export type AppPage = 'main' | 'agent' | 'files' | 'kanban'

export interface AppRouterState {
  page: AppPage
}

export const appRouterState = $state<AppRouterState>(parseHash(currentHash()))

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', syncRoute)
}

function currentHash(): string {
  return typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/'
}

function syncRoute(): void {
  Object.assign(appRouterState, parseHash(currentHash()))
}

function parseHash(hash: string): AppRouterState {
  const path = hash || '/'

  if (path === '/main') {
    return { page: 'main' }
  }

  if (path === '/files') {
    return { page: 'files' }
  }

  if (path === '/kanban') {
    return { page: 'kanban' }
  }

  return { page: 'agent' }
}

export function mainRoute(): string {
  return '/main'
}

export function agentRoute(sessionId?: null | string): string {
  const id = sessionId?.trim()
  return id ? `/cmd/${encodeURIComponent(id)}` : '/cmd'
}

export function filesRoute(): string {
  return '/files'
}

export function kanbanRoute(): string {
  return '/kanban'
}
