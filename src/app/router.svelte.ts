export type AppPage = 'main' | 'agent'

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

  return { page: 'agent' }
}

export function mainRoute(): string {
  return '/main'
}

export function agentRoute(): string {
  return '/agent'
}
