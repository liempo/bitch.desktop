/* ------------------------------------------------------------------ */
/*  Layout state — sidebar visibility + session pins (localStorage)    */
/* ------------------------------------------------------------------ */

import { readNamespacedStorageItem, writeNamespacedStorageItem } from '$lib/storage/namespace'

const PINNED_STORAGE_SUFFIX = 'pinnedSessions'

/* ---------- helpers ---------- */

function loadPins(): string[] {
  try {
    const raw = readNamespacedStorageItem(PINNED_STORAGE_SUFFIX)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function savePins(ids: string[]): void {
  try {
    writeNamespacedStorageItem(PINNED_STORAGE_SUFFIX, JSON.stringify(ids))
  } catch {
    /* storage full or unavailable — best-effort */
  }
}

/* ---------- reactive state ---------- */

export const layoutState = $state({
  sidebarOpen: true,
  pinnedSessionIds: loadPins()
})

function persistPins(): void {
  savePins(layoutState.pinnedSessionIds)
}

/* ---------- actions ---------- */

export function toggleSidebar(): void {
  layoutState.sidebarOpen = !layoutState.sidebarOpen
}

export function pinSession(id: string): void {
  if (!layoutState.pinnedSessionIds.includes(id)) {
    layoutState.pinnedSessionIds.push(id)
    persistPins()
  }
}

export function unpinSession(id: string): void {
  const idx = layoutState.pinnedSessionIds.indexOf(id)

  if (idx !== -1) {
    layoutState.pinnedSessionIds.splice(idx, 1)
    persistPins()
  }
}

export function isPinned(id: string): boolean {
  return layoutState.pinnedSessionIds.includes(id)
}
