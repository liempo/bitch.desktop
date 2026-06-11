import { threadForSession } from '$lib/stores/messages.svelte'
import { isSessionWorking, sessionState } from '$lib/stores/session.svelte'

export function sessionMessagesLoaded(sessionId: null | string | undefined): boolean {
  return threadForSession(sessionId)?.hydrated === true
}

export function shouldShowSessionSidebarLoader(sessionId: null | string | undefined): boolean {
  const id = sessionId?.trim()
  if (!id) return false

  const thread = threadForSession(id)
  const busy = thread?.busy === true || isSessionWorking(id)
  const resumingUnloadedSession = sessionState.resumingSessionId === id && thread?.hydrated !== true

  return busy || resumingUnloadedSession
}
