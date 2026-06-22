import { threadForSession } from '$lib/hermes/threads'
import { isSessionWorking, sessionState } from '$lib/hermes/sessions'

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
