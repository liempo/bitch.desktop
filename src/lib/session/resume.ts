import { getSessionMessages } from '$lib/api/dashboard'
import {
  hydrateSessionMessagesFromGateway,
  setThreadLoading,
  shouldPreserveLiveThread,
  syncRunningFromResume
} from '$lib/stores/messages.svelte'
import {
  beginResumeSession,
  isCurrentResumeRequest,
  profileForSession,
  resumeSession,
  sessionState
} from '$lib/stores/session.svelte'
import type { SessionMessage } from '$lib/types/hermes'

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isStoredSessionNotFound(error: unknown): boolean {
  const message = messageFor(error)
  return /session not found/i.test(message) || (/404/i.test(message) && /not found/i.test(message))
}

function releaseStaleThreadLoading(sessionId: string, requestId: number): void {
  if (isCurrentResumeRequest(sessionId, requestId)) return
  if (sessionState.resumingSessionId === sessionId) return
  setThreadLoading(sessionId, false)
}

async function loadStoredSnapshot(sessionId: string, requestId: number): Promise<SessionMessage[] | null> {
  try {
    const response = await getSessionMessages(sessionId, profileForSession(sessionId))

    if (!isCurrentResumeRequest(sessionId, requestId)) {
      return null
    }

    return response.messages
  } catch (error) {
    if (isCurrentResumeRequest(sessionId, requestId) && !isStoredSessionNotFound(error)) {
      // A stored-history miss should not prevent resume; the gateway may still
      // return a projected transcript. Preserve the error for diagnostics while
      // keeping the live resume path available.
      sessionState.error = messageFor(error)
      console.error('Failed to load stored session snapshot:', error)
    }

    return []
  }
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
    setThreadLoading(previousResumingSessionId, false)
  }

  setThreadLoading(sessionId, true)

  try {
    const storedSnapshot = await loadStoredSnapshot(sessionId, requestId)

    if (storedSnapshot === null || !isCurrentResumeRequest(sessionId, requestId)) {
      releaseStaleThreadLoading(sessionId, requestId)
      return false
    }

    const hasStoredSnapshot = storedSnapshot.length > 0

    if (hasStoredSnapshot && !shouldPreserveLiveThread(sessionId, storedSnapshot.length)) {
      hydrateSessionMessagesFromGateway(sessionId, storedSnapshot)
    }

    const response = await resumeSession(sessionId, requestId)

    if (!response || !isCurrentResumeRequest(sessionId, requestId)) {
      releaseStaleThreadLoading(sessionId, requestId)
      return false
    }

    syncRunningFromResume(sessionId, response.info)

    const resumeMessages = response.messages ?? []
    if (!hasStoredSnapshot && !shouldPreserveLiveThread(sessionId, resumeMessages.length)) {
      hydrateSessionMessagesFromGateway(sessionId, resumeMessages)
    }

    return true
  } finally {
    if (isCurrentResumeRequest(sessionId, requestId)) {
      setThreadLoading(sessionId, false)
    } else {
      releaseStaleThreadLoading(sessionId, requestId)
    }
  }
}
