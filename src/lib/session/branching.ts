import type { SessionInfo } from '$lib/types/hermes'

function parentIdFor(session: SessionInfo | null | undefined): string | null {
  const parentId = session?.parent_session_id?.trim()
  return parentId || null
}

function recentValue(session: SessionInfo): number {
  return session.last_active || session.started_at || 0
}

function baseBranchTitle(session: SessionInfo | null | undefined): string {
  return relatedBranchTitle(session)
    .replace(/\s+#\d+$/, '')
    .trim()
}

export function isBranchSession(session: SessionInfo | null | undefined): boolean {
  return Boolean(parentIdFor(session))
}

export function parentSessionForSession(
  session: SessionInfo | null | undefined,
  sessions: SessionInfo[]
): SessionInfo | null {
  const parentId = parentIdFor(session)
  if (!parentId) return null

  return sessions.find(candidate => candidate.id === parentId) ?? null
}

export function branchChildrenForSession(
  session: SessionInfo | null | undefined,
  sessions: SessionInfo[]
): SessionInfo[] {
  if (!session?.id) return []

  return sessions
    .filter(candidate => candidate.parent_session_id?.trim() === session.id)
    .sort((left, right) => recentValue(right) - recentValue(left))
}

export function relatedBranchTitle(session: SessionInfo | null | undefined): string {
  return session?.title?.trim() || session?.preview?.replace(/\s+/g, ' ').trim() || session?.id || 'Untitled session'
}

export function nextBranchTitle(session: SessionInfo | null | undefined, sessions: SessionInfo[]): string {
  const base = baseBranchTitle(session) || session?.id || 'Session branch'
  const existingBranches = session ? branchChildrenForSession(session, sessions).length : 0

  return `${base} #${existingBranches + 2}`
}
