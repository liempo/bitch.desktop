import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearComposerPromptHistory,
  recallComposerPromptHistory,
  recordComposerPromptHistory,
  resetComposerPromptHistoryNavigation,
  shouldNavigateComposerPromptHistory
} from '$lib/hermes/composer'

describe('composer prompt history', () => {
  beforeEach(() => {
    clearComposerPromptHistory('stored-A')
    clearComposerPromptHistory('stored-B')
  })

  it('recalls submitted prompts newest-to-oldest and restores the draft after the newest entry', () => {
    recordComposerPromptHistory('stored-A', 'first prompt')
    recordComposerPromptHistory('stored-A', 'second prompt')

    expect(recallComposerPromptHistory('stored-A', 'previous', '')).toBe('second prompt')
    expect(recallComposerPromptHistory('stored-A', 'previous', 'second prompt')).toBe('first prompt')
    expect(recallComposerPromptHistory('stored-A', 'next', 'first prompt')).toBe('second prompt')
    expect(recallComposerPromptHistory('stored-A', 'next', 'second prompt')).toBe('')
  })

  it('keeps history isolated by session and ignores blank or consecutive duplicate prompts', () => {
    recordComposerPromptHistory('stored-A', 'same prompt')
    recordComposerPromptHistory('stored-A', 'same prompt')
    recordComposerPromptHistory('stored-A', '   ')
    recordComposerPromptHistory('stored-B', 'other session prompt')

    expect(recallComposerPromptHistory('stored-A', 'previous', '')).toBe('same prompt')
    expect(recallComposerPromptHistory('stored-A', 'previous', 'same prompt')).toBe('same prompt')
    expect(recallComposerPromptHistory('stored-B', 'previous', '')).toBe('other session prompt')
  })

  it('resets navigation when the operator edits the recalled draft', () => {
    recordComposerPromptHistory('stored-A', 'old prompt')
    recordComposerPromptHistory('stored-A', 'new prompt')

    expect(recallComposerPromptHistory('stored-A', 'previous', '')).toBe('new prompt')
    resetComposerPromptHistoryNavigation('stored-A')

    expect(recallComposerPromptHistory('stored-A', 'previous', 'manual edit')).toBe('new prompt')
    expect(recallComposerPromptHistory('stored-A', 'next', 'new prompt')).toBe('manual edit')
  })

  it('allows arrow-key history only for empty drafts or textarea boundary cursors', () => {
    expect(
      shouldNavigateComposerPromptHistory({
        direction: 'previous',
        draft: '',
        selectionEnd: 0,
        selectionStart: 0
      })
    ).toBe(true)
    expect(
      shouldNavigateComposerPromptHistory({
        direction: 'previous',
        draft: 'first line\nsecond line',
        selectionEnd: 2,
        selectionStart: 2
      })
    ).toBe(true)
    expect(
      shouldNavigateComposerPromptHistory({
        direction: 'previous',
        draft: 'first line\nsecond line',
        selectionEnd: 13,
        selectionStart: 13
      })
    ).toBe(false)
    expect(
      shouldNavigateComposerPromptHistory({
        direction: 'next',
        draft: 'first line\nsecond line',
        selectionEnd: 2,
        selectionStart: 2
      })
    ).toBe(false)
    expect(
      shouldNavigateComposerPromptHistory({
        direction: 'next',
        draft: 'first line\nsecond line',
        selectionEnd: 22,
        selectionStart: 22
      })
    ).toBe(true)
    expect(
      shouldNavigateComposerPromptHistory({
        direction: 'next',
        draft: 'prompt',
        selectionEnd: 4,
        selectionStart: 1
      })
    ).toBe(false)
  })
})
