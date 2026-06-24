import { getSessionMessages } from '$lib/hermes/dashboard'
import { messageForError } from '$lib/errors'
import {
  hydrateSessionMessagesFromGateway,
  setConversationLoading,
  shouldPreserveLiveConversation,
  syncRunningFromResume
} from '$lib/hermes/conversations'
import {
  beginResumeSession,
  isCurrentResumeRequest,
  lineageMessageSessionIds,
  profileForSession,
  resumeSession,
  runtimeSessionIdForStored,
  sessionState
} from '$lib/hermes/sessions'
import type { SessionMessage } from '$lib/types/hermes'

function isStoredSessionNotFound(error: unknown): boolean {
  const message = messageForError(error)
  return /session not found/i.test(message) || (/404/i.test(message) && /not found/i.test(message))
}

function releaseStaleConversationLoading(sessionId: string, requestId: number): void {
  if (isCurrentResumeRequest(sessionId, requestId)) return
  if (sessionState.resumingSessionId === sessionId) return
  setConversationLoading(sessionId, false)
}

function finishCurrentResume(sessionId: string, requestId: number): void {
  if (isCurrentResumeRequest(sessionId, requestId)) {
    sessionState.resumingSessionId = null
  }
}

function preserveOptimisticLiveConversation(sessionId: string, snapshotLength: number): boolean {
  return Boolean(runtimeSessionIdForStored(sessionId) && shouldPreserveLiveConversation(sessionId, snapshotLength))
}

async function loadStoredSnapshot(sessionId: string, requestId: number): Promise<SessionMessage[] | null> {
  const profile = profileForSession(sessionId)
  const lineageIds = lineageMessageSessionIds(sessionId)
  const snapshotRequests = lineageIds.map(id => getSessionMessages(id, profile))
  const results = await Promise.allSettled(snapshotRequests)

  if (!isCurrentResumeRequest(sessionId, requestId)) {
    return null
  }

  const messages: SessionMessage[] = []

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      messages.push(...result.value.messages)
      continue
    }

    if (!isStoredSessionNotFound(result.reason)) {
      // A stored-history miss should not prevent resume; the gateway may still
      // return a projected transcript. Preserve the error for diagnostics while
      // keeping the live resume path available.
      sessionState.error = messageForError(result.reason)
      console.error(`Failed to load stored session snapshot for ${lineageIds[index]}:`, result.reason)
    }
  }

  return messages
}

/**
 * Resume a stored session using the same ownership split as Hermes Desktop:
 *
 * 1. stored session id drives the route/history fetch
 * 2. live runtime id returned by session.resume drives RPCs
 * 3. stale route/resume completions are ignored
 * 4. stored snapshots win over resume projection messages when present
 */
export async function resumeAndHydrateStoredSession(sessionId: string): Promise<boolean> {
  const previousResumingSessionId = sessionState.resumingSessionId
  const requestId = beginResumeSession(sessionId)

  if (previousResumingSessionId && previousResumingSessionId !== sessionId) {
    setConversationLoading(previousResumingSessionId, false)
  }

  setConversationLoading(sessionId, true)

  try {
    const storedSnapshot = await loadStoredSnapshot(sessionId, requestId)

    if (storedSnapshot === null || !isCurrentResumeRequest(sessionId, requestId)) {
      releaseStaleConversationLoading(sessionId, requestId)
      return false
    }

    const hasStoredSnapshot = storedSnapshot.length > 0

    if (hasStoredSnapshot && !shouldPreserveLiveConversation(sessionId, storedSnapshot.length)) {
      hydrateSessionMessagesFromGateway(sessionId, storedSnapshot)
    }

    if (!hasStoredSnapshot && preserveOptimisticLiveConversation(sessionId, storedSnapshot.length)) {
      // Fresh sessions can route before the dashboard has persisted history.
      // Keep the cached runtime mapping so live stream events still paint the
      // current conversation instead of falling through to a stored-session 404.
      sessionState.resumeFailedSessionId =
        sessionState.resumeFailedSessionId === sessionId ? null : sessionState.resumeFailedSessionId
      sessionState.resumeExhaustedSessionId =
        sessionState.resumeExhaustedSessionId === sessionId ? null : sessionState.resumeExhaustedSessionId
      finishCurrentResume(sessionId, requestId)
      return true
    }

    const response = await resumeSession(sessionId, requestId)

    if (!response || !isCurrentResumeRequest(sessionId, requestId)) {
      if (!response && isCurrentResumeRequest(sessionId, requestId) && !hasStoredSnapshot) {
        sessionState.resumeFailedSessionId = sessionId
      }
      releaseStaleConversationLoading(sessionId, requestId)
      return false
    }

    sessionState.resumeFailedSessionId =
      sessionState.resumeFailedSessionId === sessionId ? null : sessionState.resumeFailedSessionId
    sessionState.resumeExhaustedSessionId =
      sessionState.resumeExhaustedSessionId === sessionId ? null : sessionState.resumeExhaustedSessionId

    syncRunningFromResume(sessionId, response.info)

    const resumeMessages = response.messages ?? []
    if (!hasStoredSnapshot && !shouldPreserveLiveConversation(sessionId, resumeMessages.length)) {
      hydrateSessionMessagesFromGateway(sessionId, resumeMessages)
    }

    return true
  } finally {
    if (isCurrentResumeRequest(sessionId, requestId)) {
      setConversationLoading(sessionId, false)
    } else {
      releaseStaleConversationLoading(sessionId, requestId)
    }
  }
}
