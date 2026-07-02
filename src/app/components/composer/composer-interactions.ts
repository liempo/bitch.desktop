import { shouldNavigateComposerPromptHistory, type ComposerPromptHistoryDirection } from '$lib/hermes/composer'

interface ComposerKeydownLike {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

interface ComposerTextareaCursor {
  draft: string
  selectionEnd: number
  selectionStart: number
}

export interface QueuedPromptActionState {
  canMoveDown: boolean
  canMoveUp: boolean
  editLabel: string
  moveDownLabel: string
  moveUpLabel: string
  removeLabel: string
}

export function composerHistoryDirectionForKeydown(
  event: ComposerKeydownLike,
  cursor: ComposerTextareaCursor
): ComposerPromptHistoryDirection | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null

  const direction = event.key === 'ArrowUp' ? 'previous' : event.key === 'ArrowDown' ? 'next' : null
  if (!direction) return null

  return shouldNavigateComposerPromptHistory({ direction, ...cursor }) ? direction : null
}

export function queuedPromptActionState(index: number, total: number): QueuedPromptActionState {
  const ordinal = index + 1

  return {
    canMoveDown: index < total - 1,
    canMoveUp: index > 0,
    editLabel: `Edit queued prompt ${ordinal}`,
    moveDownLabel: `Move queued prompt ${ordinal} down`,
    moveUpLabel: `Move queued prompt ${ordinal} up`,
    removeLabel: `Remove queued prompt ${ordinal}`
  }
}
