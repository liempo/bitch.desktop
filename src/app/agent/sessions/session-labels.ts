import type { SessionInfo } from '$lib/types/hermes'

export function compactSessionText(value: null | string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

export function shortSessionId(id: null | string | undefined): string {
  const compact = compactSessionText(id)
  if (!compact) return 'unknown'

  return compact.slice(0, 8)
}

export function formatSessionDialogTitle(session: SessionInfo): string {
  return (
    compactSessionText(session.title) || compactSessionText(session.preview) || `Session ${shortSessionId(session.id)}`
  )
}

export function formatSessionDialogPreview(session: SessionInfo): string {
  const preview = compactSessionText(session.preview)
  const title = compactSessionText(session.title)

  return preview === title ? '' : preview
}
