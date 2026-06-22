import { conversationForSession } from '$lib/hermes/conversations'
import { isSessionWorking, sessionState } from '$lib/hermes/sessions'

export function sessionMessagesLoaded(sessionId: null | string | undefined): boolean {
  return conversationForSession(sessionId)?.hydrated === true
}

export function shouldShowSessionSidebarLoader(sessionId: null | string | undefined): boolean {
  const id = sessionId?.trim()
  if (!id) return false

  const conversation = conversationForSession(id)
  const busy = conversation?.busy === true || isSessionWorking(id)
  const resumingUnloadedSession = sessionState.resumingSessionId === id && conversation?.hydrated !== true

  return busy || resumingUnloadedSession
}
