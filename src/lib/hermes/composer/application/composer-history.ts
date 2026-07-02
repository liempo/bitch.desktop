export type ComposerPromptHistoryDirection = 'next' | 'previous'

export interface ComposerPromptHistoryNavigationInput {
  direction: ComposerPromptHistoryDirection
  draft: string
  selectionEnd: number
  selectionStart: number
}

interface PromptHistorySession {
  cursor: null | number
  draftBeforeNavigation: string
  entries: string[]
}

const MAX_HISTORY_ENTRIES = 50

let promptHistoryBySession: Record<string, PromptHistorySession> = {}

function sessionKeyOf(key: null | string | undefined): null | string {
  const trimmed = key?.trim()
  return trimmed ? trimmed : null
}

function stateFor(sessionKey: string): PromptHistorySession {
  promptHistoryBySession[sessionKey] ??= {
    cursor: null,
    draftBeforeNavigation: '',
    entries: []
  }

  return promptHistoryBySession[sessionKey]
}

function clampSelection(value: number, draft: string): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(draft.length, Math.trunc(value)))
}

export function clearComposerPromptHistory(key?: null | string): void {
  const sessionKey = sessionKeyOf(key)

  if (!sessionKey) {
    promptHistoryBySession = {}
    return
  }

  delete promptHistoryBySession[sessionKey]
}

export function recordComposerPromptHistory(key: null | string | undefined, text: string): void {
  const sessionKey = sessionKeyOf(key)
  const prompt = text.trim()
  if (!sessionKey || !prompt) return

  const state = stateFor(sessionKey)
  const dedupedEntries = state.entries.filter(entry => entry !== prompt)
  state.entries = [...dedupedEntries, prompt].slice(-MAX_HISTORY_ENTRIES)
  resetComposerPromptHistoryNavigation(sessionKey)
}

export function resetComposerPromptHistoryNavigation(key: null | string | undefined): void {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return

  const state = promptHistoryBySession[sessionKey]
  if (!state) return

  state.cursor = null
  state.draftBeforeNavigation = ''
}

export function recallComposerPromptHistory(
  key: null | string | undefined,
  direction: ComposerPromptHistoryDirection,
  currentDraft: string
): null | string {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return null

  const state = stateFor(sessionKey)
  if (state.entries.length === 0) return null

  if (state.cursor === null) {
    if (direction === 'next') return null
    state.cursor = state.entries.length
    state.draftBeforeNavigation = currentDraft
  }

  if (direction === 'previous') {
    state.cursor = Math.max(0, state.cursor - 1)
    return state.entries[state.cursor] ?? null
  }

  if (state.cursor < state.entries.length - 1) {
    state.cursor += 1
    return state.entries[state.cursor] ?? null
  }

  const restoredDraft = state.draftBeforeNavigation
  resetComposerPromptHistoryNavigation(sessionKey)
  return restoredDraft
}

export function shouldNavigateComposerPromptHistory(input: ComposerPromptHistoryNavigationInput): boolean {
  const draft = input.draft
  const selectionStart = clampSelection(input.selectionStart, draft)
  const selectionEnd = clampSelection(input.selectionEnd, draft)

  if (selectionStart !== selectionEnd) return false
  if (!draft.trim()) return true

  if (input.direction === 'previous') {
    return !draft.slice(0, selectionStart).includes('\n')
  }

  return !draft.slice(selectionEnd).includes('\n')
}
