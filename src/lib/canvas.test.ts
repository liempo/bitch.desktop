import { afterEach, describe, expect, it, vi } from 'vitest'

const TEST_BOX_BASE_URL = 'https://box.example.test'

async function loadCanvasHelpers(): Promise<typeof import('./canvas')> {
  vi.resetModules()
  vi.stubEnv('VITE_BOX_BASE_URL', TEST_BOX_BASE_URL)
  return import('./canvas')
}

describe('canvas helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('extracts a BOX canvas directive and strips it from visible text', async () => {
    const { extractCanvasReferences } = await loadCanvasHelpers()

    const result = extractCanvasReferences('Rendered artifact\nCANVAS:/box/render.html')

    expect(result.cleanedText).toBe('Rendered artifact')
    expect(result.canvases).toEqual([
      expect.objectContaining({
        label: 'render.html',
        path: '/box/render.html',
        source: '/box/render.html',
        url: `${TEST_BOX_BASE_URL}/render.html`
      })
    ])
  })

  it('supports file URLs rooted under /box with encoded spaces', async () => {
    const { extractCanvasReferences } = await loadCanvasHelpers()

    const result = extractCanvasReferences('canvas:`file:///box/wiki/demo%20space/render.html`')

    expect(result.cleanedText).toBe('')
    expect(result.latestCanvas).toMatchObject({
      label: 'render.html',
      path: '/box/wiki/demo space/render.html',
      source: 'file:///box/wiki/demo%20space/render.html',
      url: `${TEST_BOX_BASE_URL}/wiki/demo%20space/render.html`
    })
  })

  it('accepts remote HTTPS canvases without BOX rewriting', async () => {
    const { canvasFromSource } = await loadCanvasHelpers()

    expect(canvasFromSource('https://example.test/render.html?rev=1')).toMatchObject({
      label: 'render.html',
      source: 'https://example.test/render.html?rev=1',
      url: 'https://example.test/render.html?rev=1'
    })
  })

  it('keeps non-BOX local paths out of iframe URLs', async () => {
    const { extractCanvasReferences } = await loadCanvasHelpers()

    const result = extractCanvasReferences('CANVAS:/tmp/render.html')

    expect(result.cleanedText).toBe('')
    expect(result.latestCanvas).toMatchObject({
      label: 'render.html',
      path: '/tmp/render.html',
      source: '/tmp/render.html',
      url: null
    })
    expect(result.latestCanvas?.error).toContain('/box')
  })

  it('uses the last canvas directive as the active canvas', async () => {
    const { extractCanvasReferences } = await loadCanvasHelpers()

    const result = extractCanvasReferences('CANVAS:/box/first.html\nCANVAS:/box/second.html')

    expect(result.canvases).toHaveLength(2)
    expect(result.latestCanvas).toMatchObject({
      label: 'second.html',
      url: `${TEST_BOX_BASE_URL}/second.html`
    })
  })
})
