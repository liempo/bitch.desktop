import { getSessionMessages } from '$lib/dashboard-api'
import { hydrateSessionMessagesFromGateway } from '$lib/stores/messages.svelte'
import { beginResumeSession, isCurrentResumeRequest, resumeSession, sessionState } from '$lib/stores/session.svelte'
import type { SessionMessage } from '$lib/types/hermes'

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadStoredSnapshot(sessionId: string, requestId: number): Promise<SessionMessage[] | null> {
  try {
    const response = await getSessionMessages(sessionId)

    if (!isCurrentResumeRequest(sessionId, requestId)) {
      return null
    }

    return response.messages
  } catch (error) {
    if (isCurrentResumeRequest(sessionId, requestId)) {
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
  const requestId = beginResumeSession(sessionId)
  const storedSnapshot = await loadStoredSnapshot(sessionId, requestId)

  if (storedSnapshot === null || !isCurrentResumeRequest(sessionId, requestId)) {
    return false
  }

  const hasStoredSnapshot = storedSnapshot.length > 0

  if (hasStoredSnapshot) {
    hydrateSessionMessagesFromGateway(sessionId, storedSnapshot)
  }

  const response = await resumeSession(sessionId, requestId)

  if (!response || !isCurrentResumeRequest(sessionId, requestId)) {
    return false
  }

  if (!hasStoredSnapshot) {
    hydrateSessionMessagesFromGateway(sessionId, response.messages ?? [])
  }

  return true
}
