/* ------------------------------------------------------------------ */
/*  Hash-based router suitable for Tauri webview (no server needed)    */
/* ------------------------------------------------------------------ */

type Route = 'new' | 'session'

export interface RouterState {
  route: Route
  sessionId: string | null
}

/* ---------- reactive state ---------- */

export const routerState = $state<RouterState>(parseHash(currentHash()))

/* ---------- listeners ---------- */

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', syncRoute)
}

/* ---------- helpers ---------- */

function currentHash(): string {
  return typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/'
}

function syncRoute(): void {
  Object.assign(routerState, parseHash(currentHash()))
}

function parseHash(hash: string): RouterState {
  const path = hash || '/'

  /* /agent and legacy /cmd → new chat */
  if (path === '/' || path === '/agent' || path === '/cmd') {
    return { route: 'new', sessionId: null }
  }

  /* /agent/:sessionId and legacy /cmd/:sessionId → resume session */
  const match = path.match(/^\/(?:agent|cmd)\/([a-zA-Z0-9_-]+)(?:\/.*)?$/)

  if (match) {
    return { route: 'session', sessionId: match[1] }
  }

  /* Fallback */
  return { route: 'new', sessionId: null }
}

/* ---------- public API ---------- */

/**
 * Navigate to a hash route.
 * @param hash - e.g. `'/'`, `'/agent'`, or `'/agent/abc123'`
 */
export function navigate(hash: string): void {
  window.location.hash = hash === '/' ? '/agent' : hash
  /* Immediately sync so state updates without waiting for hashchange */
  syncRoute()
}

/** Build a hash for a session id */
export function sessionRoute(sessionId: string): string {
  return `/agent/${encodeURIComponent(sessionId)}`
}
