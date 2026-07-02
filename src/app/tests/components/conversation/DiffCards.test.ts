// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import DiffCards from '../../../components/conversation/DiffCards.svelte'
import type { DiffCard } from '$lib/hermes/conversations'

const FILE_RAW_PATCH = `--- /opt/data/src/app.ts
+++ /opt/data/src/app.ts
@@ -1,2 +1,2 @@
-const current = false
+const next = true
`

function diffCard(): DiffCard {
  return {
    files: [
      {
        absolutePath: '/opt/data/src/app.ts',
        additions: 1,
        changeKind: 'modified',
        deletions: 1,
        displayPath: 'src/app.ts',
        hunks: [
          {
            header: '@@ -1,2 +1,2 @@',
            lines: [
              { content: '-const current = false', kind: 'delete', newLine: null, oldLine: 1 },
              { content: '+const next = true', kind: 'add', newLine: 1, oldLine: null }
            ],
            newStart: 1,
            oldStart: 1
          }
        ],
        id: 'src/app.ts',
        metaLines: [],
        newPath: '/opt/data/src/app.ts',
        oldPath: '/opt/data/src/app.ts',
        rawText: FILE_RAW_PATCH
      }
    ],
    malformed: false,
    rawText: FILE_RAW_PATCH
  }
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    element => element.getAttribute('aria-label') === label
  )
  expect(button).toBeInstanceOf(HTMLButtonElement)
  return button as HTMLButtonElement
}

describe('DiffCards rendered behavior', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders file cards with an expand/collapse affordance', async () => {
    const component = mount(DiffCards, { target: document.body, props: { card: diffCard() } })

    expect(document.querySelector('[data-diff-file-body="src/app.ts"]')?.textContent).toContain('const next = true')

    buttonByLabel('Collapse diff for src/app.ts').click()
    await tick()

    expect(document.querySelector('[data-diff-file-body="src/app.ts"]')).toBeNull()
    expect(buttonByLabel('Expand diff for src/app.ts').disabled).toBe(false)

    unmount(component)
  })

  it('copies the selected file patch through the clipboard affordance', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const component = mount(DiffCards, { target: document.body, props: { card: diffCard() } })

    buttonByLabel('Copy patch for src/app.ts').click()
    await tick()

    expect(writeText).toHaveBeenCalledWith(FILE_RAW_PATCH)
    expect(buttonByLabel('Copied patch for src/app.ts').disabled).toBe(false)

    unmount(component)
  })

  it('routes absolute remote paths to the preview rail without fetching bytes in the renderer', () => {
    const onOpenPreview = vi.fn()
    const component = mount(DiffCards, {
      target: document.body,
      props: { card: diffCard(), onOpenPreview, profile: 'worker-a' }
    })

    buttonByLabel('Open remote file for /opt/data/src/app.ts').click()

    expect(onOpenPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'app.ts',
        path: '/opt/data/src/app.ts',
        profile: 'worker-a',
        source: '/opt/data/src/app.ts',
        url: null,
        viewerKind: 'text'
      })
    )
    expect(document.body.innerHTML).not.toContain('/api/fs/read-data-url')
    expect(document.body.innerHTML).not.toContain('/api/fs/read-text')

    unmount(component)
  })

  it('preserves hunk metadata lines without stripping their leading marker', () => {
    const card = diffCard()
    card.files[0]?.hunks[0]?.lines.push({
      content: '\\ No newline at end of file',
      kind: 'meta',
      newLine: null,
      oldLine: null
    })

    const component = mount(DiffCards, { target: document.body, props: { card } })

    expect(document.querySelector('[data-diff-file-body="src/app.ts"]')?.textContent).toContain(
      '\\ No newline at end of file'
    )

    unmount(component)
  })
})
