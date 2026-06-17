import { afterEach, describe, expect, it, vi } from 'vitest'

const TEST_BOX_BASE_URL = 'https://box.example.test'

async function loadPreviewHelpers(): Promise<typeof import('./preview')> {
  vi.resetModules()
  vi.stubEnv('VITE_BOX_BASE_URL', TEST_BOX_BASE_URL)
  return import('./preview')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('preview targets', () => {
  it('turns /box image paths into image preview targets', async () => {
    const { previewFromBoxPath } = await loadPreviewHelpers()

    expect(previewFromBoxPath('/box/.hermes/cache/render 1.png')).toMatchObject({
      kind: 'image',
      label: 'render 1.png',
      path: '/box/.hermes/cache/render 1.png',
      source: '/box/.hermes/cache/render 1.png',
      url: `${TEST_BOX_BASE_URL}/.hermes/cache/render%201.png`
    })
  })

  it('keeps non-image /box paths as file preview targets', async () => {
    const { previewFromBoxPath } = await loadPreviewHelpers()

    expect(previewFromBoxPath('/box/wiki/personal/notes.pdf')).toMatchObject({
      kind: 'file',
      label: 'notes.pdf',
      path: '/box/wiki/personal/notes.pdf',
      source: '/box/wiki/personal/notes.pdf',
      url: `${TEST_BOX_BASE_URL}/wiki/personal/notes.pdf`
    })
  })

  it('builds local explicit file references without a browser-fetchable URL', async () => {
    const { previewFromFileReference } = await loadPreviewHelpers()

    expect(previewFromFileReference('/opt/data/report 1.pdf')).toMatchObject({
      kind: 'file',
      label: 'report 1.pdf',
      path: '/opt/data/report 1.pdf',
      source: '/opt/data/report 1.pdf',
      url: null,
      error: 'Local file references are not browser-fetchable yet.'
    })
    expect(previewFromFileReference('/opt/data/render.png')).toMatchObject({
      kind: 'image',
      label: 'render.png',
      path: '/opt/data/render.png',
      source: '/opt/data/render.png',
      url: null
    })
  })

  it('wraps canvas records as canvas preview targets', async () => {
    const { previewFromCanvas } = await loadPreviewHelpers()

    expect(
      previewFromCanvas({
        label: 'render.html',
        path: '/box/render.html',
        source: '/box/render.html',
        url: `${TEST_BOX_BASE_URL}/render.html`
      })
    ).toMatchObject({
      kind: 'canvas',
      label: 'render.html',
      path: '/box/render.html',
      source: '/box/render.html',
      url: `${TEST_BOX_BASE_URL}/render.html`
    })
  })
})
