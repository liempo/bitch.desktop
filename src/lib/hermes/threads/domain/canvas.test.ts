import { describe, expect, it } from 'vitest'

describe('canvas helpers', () => {
  it('extracts a remote canvas directive and strips it from visible text', async () => {
    const { extractCanvasReferences } = await import('./canvas')

    const result = extractCanvasReferences('Rendered artifact\nCANVAS:/tmp/render.html')

    expect(result.cleanedText).toBe('Rendered artifact')
    expect(result.canvases).toEqual([
      expect.objectContaining({
        label: 'render.html',
        path: '/tmp/render.html',
        source: '/tmp/render.html',
        url: null
      })
    ])
  })

  it('supports file URLs with encoded spaces', async () => {
    const { extractCanvasReferences } = await import('./canvas')

    const result = extractCanvasReferences('canvas:`file:///opt/data/demo%20space/render.html`')

    expect(result.cleanedText).toBe('')
    expect(result.latestCanvas).toMatchObject({
      label: 'render.html',
      path: '/opt/data/demo space/render.html',
      source: 'file:///opt/data/demo%20space/render.html',
      url: null
    })
  })

  it('accepts remote HTTPS canvases without filesystem rewriting', async () => {
    const { canvasFromSource } = await import('./canvas')

    expect(canvasFromSource('https://example.test/render.html?rev=1')).toMatchObject({
      label: 'render.html',
      source: 'https://example.test/render.html?rev=1',
      url: 'https://example.test/render.html?rev=1'
    })
  })

  it('uses the last canvas directive as the active canvas', async () => {
    const { extractCanvasReferences } = await import('./canvas')

    const result = extractCanvasReferences('CANVAS:/tmp/first.html\nCANVAS:/opt/data/second.html')

    expect(result.canvases).toHaveLength(2)
    expect(result.latestCanvas).toMatchObject({
      label: 'second.html',
      path: '/opt/data/second.html'
    })
  })
})
