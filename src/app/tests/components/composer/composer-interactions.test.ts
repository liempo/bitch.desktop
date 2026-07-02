import { describe, expect, it } from 'vitest'

import {
  composerHistoryDirectionForKeydown,
  queuedPromptActionState
} from '../../../components/composer/composer-interactions'

describe('composer UI interaction policy', () => {
  it('maps arrow keydown events to history directions only when textarea cursor rules allow', () => {
    expect(
      composerHistoryDirectionForKeydown(
        { altKey: false, ctrlKey: false, key: 'ArrowUp', metaKey: false, shiftKey: false },
        { draft: '', selectionEnd: 0, selectionStart: 0 }
      )
    ).toBe('previous')
    expect(
      composerHistoryDirectionForKeydown(
        { altKey: false, ctrlKey: false, key: 'ArrowDown', metaKey: false, shiftKey: false },
        { draft: 'first line\nsecond line', selectionEnd: 22, selectionStart: 22 }
      )
    ).toBe('next')
    expect(
      composerHistoryDirectionForKeydown(
        { altKey: false, ctrlKey: false, key: 'ArrowUp', metaKey: false, shiftKey: false },
        { draft: 'first line\nsecond line', selectionEnd: 13, selectionStart: 13 }
      )
    ).toBeNull()
    expect(
      composerHistoryDirectionForKeydown(
        { altKey: false, ctrlKey: false, key: 'ArrowDown', metaKey: false, shiftKey: true },
        { draft: '', selectionEnd: 0, selectionStart: 0 }
      )
    ).toBeNull()
    expect(
      composerHistoryDirectionForKeydown(
        { altKey: false, ctrlKey: false, key: 'Enter', metaKey: false, shiftKey: false },
        { draft: '', selectionEnd: 0, selectionStart: 0 }
      )
    ).toBeNull()
  })

  it('derives editable queue controls for first, middle, and last prompt rows', () => {
    expect(queuedPromptActionState(0, 3)).toEqual({
      canMoveDown: true,
      canMoveUp: false,
      editLabel: 'Edit queued prompt 1',
      moveDownLabel: 'Move queued prompt 1 down',
      moveUpLabel: 'Move queued prompt 1 up',
      removeLabel: 'Remove queued prompt 1'
    })
    expect(queuedPromptActionState(1, 3)).toMatchObject({
      canMoveDown: true,
      canMoveUp: true,
      editLabel: 'Edit queued prompt 2'
    })
    expect(queuedPromptActionState(2, 3)).toMatchObject({
      canMoveDown: false,
      canMoveUp: true,
      removeLabel: 'Remove queued prompt 3'
    })
  })
})
