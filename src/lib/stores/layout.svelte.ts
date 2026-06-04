/* ------------------------------------------------------------------ */
/*  Layout state — sidebar visibility + session pins (localStorage)    */
/* ------------------------------------------------------------------ */

const PINNED_STORAGE_KEY = 'bitch.desktop.pinnedSessions'

/* ---------- helpers ---------- */

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function savePins(ids: string[]): void {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* storage full or unavailable — best-effort */
  }
}

/* ---------- reactive state ---------- */

export let sidebarOpen = $state(true)
export const pinnedSessionIds = $state<string[]>(loadPins())

/* Persist pins on every change */
$effect(() => {
  savePins(pinnedSessionIds)
})

/* ---------- actions ---------- */

export function toggleSidebar(): void {
  sidebarOpen = !sidebarOpen
}

export function setSidebarOpen(open: boolean): void {
  sidebarOpen = open
}

export function pinSession(id: string): void {
  if (!pinnedSessionIds.includes(id)) {
    pinnedSessionIds.push(id)
  }
}

export function unpinSession(id: string): void {
  const idx = pinnedSessionIds.indexOf(id)

  if (idx !== -1) {
    pinnedSessionIds.splice(idx, 1)
  }
}

export function isPinned(id: string): boolean {
  return pinnedSessionIds.includes(id)
}
