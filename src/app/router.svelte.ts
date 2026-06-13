export type AppPage = 'main' | 'agent' | 'box'

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

  if (path === '/box') {
    return { page: 'box' }
  }

  return { page: 'agent' }
}

export function mainRoute(): string {
  return '/main'
}

export function agentRoute(): string {
  return '/cmd'
}

export function boxRoute(): string {
  return '/box'
}
