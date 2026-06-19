import { describe, expect, it } from 'vitest'

describe('remote preview targets', () => {
  it('turns explicit @file refs for /box, /opt/data, and /tmp into remote preview targets', async () => {
    const { previewFromFileRef } = await import('./preview')

    expect(previewFromFileRef('@file:/box/.hermes/cache/render 1.png')).toMatchObject({
      kind: 'image',
      label: 'render 1.png',
      path: '/box/.hermes/cache/render 1.png',
      source: '@file:/box/.hermes/cache/render 1.png',
      url: null,
      viewerKind: 'image'
    })
    expect(previewFromFileRef('@file:/opt/data/reports/summary.pdf')).toMatchObject({
      kind: 'file',
      label: 'summary.pdf',
      path: '/opt/data/reports/summary.pdf',
      viewerKind: 'pdf'
    })
    expect(previewFromFileRef('@file:`/tmp/hermes remote probe.txt`')).toMatchObject({
      kind: 'file',
      label: 'hermes remote probe.txt',
      path: '/tmp/hermes remote probe.txt',
      viewerKind: 'text'
    })
    expect(previewFromFileRef('@file:/opt/data/build/WORKSPACE.bazel')).toMatchObject({
      kind: 'file',
      label: 'WORKSPACE.bazel',
      path: '/opt/data/build/WORKSPACE.bazel',
      viewerKind: 'text'
    })
    expect(previewFromFileRef('@file:/tmp/blob.bin')).toMatchObject({
      kind: 'file',
      label: 'blob.bin',
      path: '/tmp/blob.bin',
      viewerKind: 'text'
    })
  })

  it('does not infer preview targets from raw absolute paths', async () => {
    const { previewFromFileRef } = await import('./preview')

    expect(previewFromFileRef('/tmp/raw-path.png')).toBeNull()
    expect(previewFromFileRef('/box/raw-path.pdf')).toBeNull()
  })

  it('surfaces denied paths without creating a fetchable preview URL', async () => {
    const { previewFromFileRef } = await import('./preview')

    expect(previewFromFileRef('@file:/opt/data/.ssh/id_rsa')).toMatchObject({
      error: expect.stringContaining('blocked'),
      path: '/opt/data/.ssh/id_rsa',
      url: null
    })
  })

  it('wraps canvas records as canvas preview targets', async () => {
    const { previewFromCanvas } = await import('./preview')

    expect(
      previewFromCanvas({
        label: 'render.html',
        path: '/tmp/render.html',
        source: '/tmp/render.html',
        url: null
      })
    ).toMatchObject({
      kind: 'canvas',
      label: 'render.html',
      path: '/tmp/render.html',
      source: '/tmp/render.html',
      url: null,
      viewerKind: 'html'
    })
  })
})
