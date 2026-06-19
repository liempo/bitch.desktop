import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/api/dashboard', () => ({
  dashboardRequest: mockDashboardRequest
}))

describe('remote file helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes file URLs, preview hrefs, labels, and media kinds without a special root', async () => {
    const {
      filePathFromRemoteSource,
      remoteFileLabel,
      remoteFileMediaKind,
      remoteFilePreviewHref,
      sourceFromRemoteFilePreviewHref,
      viewerKindForRemoteFile
    } = await import('./remote-files')

    expect(filePathFromRemoteSource('file:///tmp/a%20b.png')).toBe('/tmp/a b.png')
    expect(remoteFileLabel('/opt/data/reports/summary.pdf')).toBe('summary.pdf')
    expect(remoteFileMediaKind('/tmp/voice.mp3')).toBe('audio')
    expect(viewerKindForRemoteFile('/opt/data/build/Makefile')).toBe('text')
    expect(viewerKindForRemoteFile('/opt/data/build/WORKSPACE.bazel')).toBe('text')
    expect(viewerKindForRemoteFile('/tmp/archive.zip')).toBe('text')
    expect(viewerKindForRemoteFile('/tmp/blob.bin')).toBe('text')

    const href = remoteFilePreviewHref('/opt/data/render 1.png')
    expect(href).toBe('#remote-file/%2Fopt%2Fdata%2Frender%201.png')
    expect(sourceFromRemoteFilePreviewHref(href)).toBe('/opt/data/render 1.png')
  })

  it('parses Hermes @file references with quoted paths and line ranges', async () => {
    const { parseHermesFileReference } = await import('./remote-files')

    expect(parseHermesFileReference('`/tmp/remote probe.txt`')).toMatchObject({
      path: '/tmp/remote probe.txt',
      source: '/tmp/remote probe.txt'
    })
    expect(parseHermesFileReference('/opt/data/example.py:10-20')).toEqual({
      path: '/opt/data/example.py',
      range: '10-20',
      source: '/opt/data/example.py:10-20'
    })
  })

  it('normalizes remote filesystem listings from /api/fs/list', async () => {
    const { normalizeRemoteFileListing } = await import('./remote-files')

    expect(
      normalizeRemoteFileListing(
        {
          entries: [
            { isDirectory: false, name: 'note.md', path: '/tmp/note.md' },
            { isDirectory: true, name: 'src', path: '/tmp/src' }
          ]
        },
        '/tmp'
      )
    ).toEqual({
      entries: [
        { kind: 'directory', name: 'src', path: '/tmp/src' },
        { kind: 'file', name: 'note.md', path: '/tmp/note.md' }
      ],
      path: '/tmp'
    })
  })

  it('reads through authenticated dashboard filesystem endpoints', async () => {
    const { fetchRemoteFileListing, getRemoteDefaultCwd, readRemoteFileDataUrl, readRemoteFileText } =
      await import('./remote-files')
    mockDashboardRequest.mockResolvedValueOnce({ entries: [] })
    await expect(fetchRemoteFileListing('/', { profile: 'astra' })).resolves.toEqual({
      entries: [],
      path: '/'
    })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/list?path=%2F',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({ text: 'hello', path: '/tmp/a.txt' })
    await expect(readRemoteFileText('/tmp/a.txt', 'astra')).resolves.toMatchObject({ text: 'hello' })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/read-text?path=%2Ftmp%2Fa.txt',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({ dataUrl: 'data:image/png;base64,AAAA' })
    await expect(readRemoteFileDataUrl('/tmp/a.png', 'astra')).resolves.toBe('data:image/png;base64,AAAA')
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/read-data-url?path=%2Ftmp%2Fa.png',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({ cwd: '/opt/data', branch: 'main' })
    await expect(getRemoteDefaultCwd('astra')).resolves.toEqual({ cwd: '/opt/data', branch: 'main' })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/default-cwd',
      profile: 'astra'
    })
  })
})
