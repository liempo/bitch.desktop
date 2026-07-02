import type { SessionInfo, SessionSearchResult } from '$lib/types/hermes'

export function compactSessionText(value: null | string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

export function shortSessionId(id: null | string | undefined): string {
  const compact = compactSessionText(id)
  if (!compact) return 'unknown'

  return compact.slice(0, 8)
}

function sessionIdentifier(session: SessionInfo | SessionSearchResult): string {
  return 'session_id' in session ? session.session_id : session.id
}

export function formatAgentSessionTitle(session: SessionInfo | SessionSearchResult): string {
  return (
    compactSessionText(session.title) ||
    compactSessionText(session.preview) ||
    `Session ${shortSessionId(sessionIdentifier(session))}`
  )
}

export function formatSessionDialogTitle(session: SessionInfo): string {
  return formatAgentSessionTitle(session)
}

export function formatSessionDialogPreview(session: SessionInfo): string {
  const preview = compactSessionText(session.preview)
  const title = compactSessionText(session.title)

  return preview === title ? '' : preview
}
