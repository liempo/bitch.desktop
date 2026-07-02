import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearQueuedPrompts,
  enqueueQueuedPrompt,
  getQueuedPrompts,
  moveQueuedPrompt,
  updateQueuedPrompt,
  type ComposerAttachment
} from '$lib/hermes/composer'

const attachment: ComposerAttachment = {
  dataUrl: 'data:text/plain;base64,aGVsbG8=',
  id: 'file-1',
  kind: 'file',
  label: 'notes.txt',
  mediaType: 'text/plain',
  size: 5
}

describe('composer queue editing', () => {
  beforeEach(() => {
    clearQueuedPrompts('stored-A')
  })

  it('edits queued prompt text while preserving cloned attachments', () => {
    const entry = enqueueQueuedPrompt('stored-A', { attachments: [attachment], text: 'original text' })

    expect(entry).not.toBeNull()
    expect(updateQueuedPrompt('stored-A', entry!.id, { text: 'revised text' })).toBe(true)

    const [queued] = getQueuedPrompts('stored-A')
    expect(queued).toMatchObject({ id: entry!.id, text: 'revised text' })
    expect(queued.attachments).toEqual([attachment])
    expect(queued.attachments[0]).not.toBe(attachment)
  })

  it('moves queued prompts up and down without crossing queue boundaries', () => {
    const first = enqueueQueuedPrompt('stored-A', { attachments: [], text: 'first' })!
    const second = enqueueQueuedPrompt('stored-A', { attachments: [], text: 'second' })!
    const third = enqueueQueuedPrompt('stored-A', { attachments: [], text: 'third' })!

    expect(moveQueuedPrompt('stored-A', third.id, 'up')).toBe(true)
    expect(getQueuedPrompts('stored-A').map(entry => entry.text)).toEqual(['first', 'third', 'second'])

    expect(moveQueuedPrompt('stored-A', first.id, 'up')).toBe(false)
    expect(getQueuedPrompts('stored-A').map(entry => entry.text)).toEqual(['first', 'third', 'second'])

    expect(moveQueuedPrompt('stored-A', first.id, 'down')).toBe(true)
    expect(getQueuedPrompts('stored-A').map(entry => entry.text)).toEqual(['third', 'first', 'second'])

    expect(moveQueuedPrompt('stored-A', second.id, 'down')).toBe(false)
    expect(getQueuedPrompts('stored-A').map(entry => entry.text)).toEqual(['third', 'first', 'second'])
  })
})
