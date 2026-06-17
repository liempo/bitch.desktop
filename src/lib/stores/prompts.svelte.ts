import { messageForError } from '$lib/errors'
import { requestGateway } from '$lib/stores/gateway.svelte'
import { ensureGatewayProfile, normalizeProfileKey } from '$lib/stores/profile.svelte'
import { profileForSession, runtimeSessionIdForStored, sessionState } from '$lib/stores/session.svelte'

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny'

export interface ClarifyRequest {
  choices: string[] | null
  profile?: null | string
  question: string
  requestId: string
  sessionId: string | null
}

export interface ApprovalRequest {
  command: string
  description: string
  profile?: null | string
  sessionId: string | null
}

export interface SudoRequest {
  profile?: null | string
  requestId: string
  sessionId?: null | string
}

export interface SecretRequest {
  envVar: string
  profile?: null | string
  prompt: string
  requestId: string
  sessionId?: string
}

export interface PromptsState {
  approvalRequest: ApprovalRequest | null
  clarifyRequests: Record<string, ClarifyRequest>
  error: string | null
  secretRequest: SecretRequest | null
  submitting: null | string
  sudoRequest: SudoRequest | null
}

const EMPTY_SESSION_KEY = ''

export const promptsState = $state<PromptsState>({
  approvalRequest: null,
  clarifyRequests: {},
  error: null,
  secretRequest: null,
  submitting: null,
  sudoRequest: null
})

function keyFor(sessionId: null | string | undefined): string {
  return sessionId?.trim() ?? EMPTY_SESSION_KEY
}

function liveSessionIdForStored(sessionId: null | string | undefined): string | undefined {
  const key = sessionId?.trim()

  if (!key) return undefined
  if (key === sessionState.activeSessionId) return key

  return (
    runtimeSessionIdForStored(key) ??
    (key === sessionState.storedSessionId ? (sessionState.activeSessionId ?? undefined) : undefined)
  )
}

async function profileForPromptRequest(
  sessionId: null | string | undefined,
  profileHint: null | string | undefined
): Promise<string | null> {
  const profile = normalizeProfileKey(profileHint ?? profileForSession(sessionId))

  if (!profileHint && profileForSession(sessionId) == null) {
    return null
  }

  await ensureGatewayProfile(profile)
  return profile
}

function beginSubmit(kind: string): void {
  promptsState.error = null
  promptsState.submitting = kind
}

function finishSubmit(kind: string): void {
  if (promptsState.submitting === kind) {
    promptsState.submitting = null
  }
}

export function setClarifyRequest(request: ClarifyRequest): void {
  promptsState.clarifyRequests[keyFor(request.sessionId)] = request
}

export function clarifyRequestForSession(sessionId: null | string | undefined): ClarifyRequest | null {
  return promptsState.clarifyRequests[keyFor(sessionId)] ?? null
}

export function clearClarifyRequest(requestId?: string, sessionId?: string | null): void {
  if (sessionId !== undefined) {
    const key = keyFor(sessionId)
    const current = promptsState.clarifyRequests[key]

    if (!current || (requestId && current.requestId !== requestId)) return

    delete promptsState.clarifyRequests[key]
    return
  }

  if (!requestId) {
    promptsState.clarifyRequests = {}
    return
  }

  for (const [key, value] of Object.entries(promptsState.clarifyRequests)) {
    if (value.requestId === requestId) {
      delete promptsState.clarifyRequests[key]
    }
  }
}

export function setApprovalRequest(request: ApprovalRequest): void {
  promptsState.approvalRequest = request
}

function clearApprovalRequest(): void {
  promptsState.approvalRequest = null
}

export function setSudoRequest(request: SudoRequest): void {
  promptsState.sudoRequest = request
}

function clearSudoRequest(requestId?: string): void {
  const current = promptsState.sudoRequest
  if (!current || (requestId && current.requestId !== requestId)) return

  promptsState.sudoRequest = null
}

export function setSecretRequest(request: SecretRequest): void {
  promptsState.secretRequest = request
}

function clearSecretRequest(requestId?: string): void {
  const current = promptsState.secretRequest
  if (!current || (requestId && current.requestId !== requestId)) return

  promptsState.secretRequest = null
}

export function clearAllPrompts(): void {
  promptsState.clarifyRequests = {}
  promptsState.approvalRequest = null
  promptsState.sudoRequest = null
  promptsState.secretRequest = null
  promptsState.submitting = null
}

export async function respondToClarify(sessionId: null | string | undefined, answer: string): Promise<boolean> {
  const request = clarifyRequestForSession(sessionId)

  if (!request) {
    promptsState.error = 'No clarify request is pending for this session.'
    return false
  }

  beginSubmit(`clarify:${request.requestId}`)

  try {
    const profile = await profileForPromptRequest(request.sessionId, request.profile)

    if (!profile) {
      throw new Error('Cannot route clarify response without a known profile.')
    }

    await requestGateway('clarify.respond', {
      request_id: request.requestId,
      answer,
      profile
    })
    clearClarifyRequest(request.requestId, request.sessionId)
    return true
  } catch (error) {
    promptsState.error = messageForError(error)
    console.error('Failed to send clarify response:', error)
    return false
  } finally {
    finishSubmit(`clarify:${request.requestId}`)
  }
}

export async function respondToApproval(choice: ApprovalChoice): Promise<boolean> {
  const request = promptsState.approvalRequest

  if (!request) {
    promptsState.error = 'No approval request is pending.'
    return false
  }

  const submitKey = `approval:${choice}`
  beginSubmit(submitKey)

  try {
    const profile = await profileForPromptRequest(request.sessionId, request.profile)

    if (!profile) {
      throw new Error('Cannot route approval response without a known profile.')
    }

    await requestGateway('approval.respond', {
      choice,
      session_id: liveSessionIdForStored(request.sessionId),
      profile
    })
    clearApprovalRequest()
    return true
  } catch (error) {
    promptsState.error = messageForError(error)
    console.error('Failed to send approval response:', error)
    return false
  } finally {
    finishSubmit(submitKey)
  }
}

export async function respondToSudo(password: string): Promise<boolean> {
  const request = promptsState.sudoRequest

  if (!request) {
    promptsState.error = 'No sudo request is pending.'
    return false
  }

  beginSubmit(`sudo:${request.requestId}`)

  try {
    const profile = await profileForPromptRequest(request.sessionId, request.profile)

    if (!profile) {
      throw new Error('Cannot route sudo response without a known profile.')
    }

    await requestGateway('sudo.respond', {
      request_id: request.requestId,
      password,
      profile
    })
    clearSudoRequest(request.requestId)
    return true
  } catch (error) {
    promptsState.error = messageForError(error)
    console.error('Failed to send sudo response:', error)
    return false
  } finally {
    finishSubmit(`sudo:${request.requestId}`)
  }
}

export async function respondToSecret(value: string): Promise<boolean> {
  const request = promptsState.secretRequest

  if (!request) {
    promptsState.error = 'No secret request is pending.'
    return false
  }

  beginSubmit(`secret:${request.requestId}`)

  try {
    const profile = await profileForPromptRequest(request.sessionId, request.profile)

    if (!profile) {
      throw new Error('Cannot route secret response without a known profile.')
    }

    await requestGateway('secret.respond', {
      request_id: request.requestId,
      value,
      profile
    })
    clearSecretRequest(request.requestId)
    return true
  } catch (error) {
    promptsState.error = messageForError(error)
    console.error('Failed to send secret response:', error)
    return false
  } finally {
    finishSubmit(`secret:${request.requestId}`)
  }
}
