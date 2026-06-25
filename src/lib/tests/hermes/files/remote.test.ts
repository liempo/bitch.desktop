import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/hermes/shared/adapters/dashboard-api-client', () => ({
  dashboardRequest: mockDashboardRequest
}))

describe('remote file helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function lastDashboardRequest(): Record<string, unknown> {
    return mockDashboardRequest.mock.calls.at(-1)?.[0] as Record<string, unknown>
  }

  it('normalizes file URLs, preview hrefs, labels, and media kinds without a special root', async () => {
    const {
      filePathFromRemoteSource,
      remoteFileLabel,
      remoteFileMediaKind,
      remoteFilePreviewHref,
      sourceFromRemoteFilePreviewHref,
      viewerKindForRemoteFile
    } = await import('../../../hermes/files/index')

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
    const { parseHermesFileReference } = await import('../../../hermes/files/index')

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
    const { normalizeRemoteFileListing } = await import('../../../hermes/files/index')

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
      await import('../../../hermes/files/index')
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

  it('routes managed remote filesystem actions through authenticated dashboard requests', async () => {
    const {
      createRemoteDirectory,
      deleteRemotePath,
      readRemoteManagedFileDataUrl,
      uploadRemoteFile,
      writeRemoteFileDataUrl
    } = await import('../../../hermes/files/index')

    mockDashboardRequest.mockResolvedValueOnce({
      ok: true,
      path: '/tmp/new folder',
      entry: {
        is_directory: true,
        mime_type: null,
        mtime: 1712345678,
        name: 'new folder',
        path: '/tmp/new folder',
        size: null
      },
      root: '/tmp',
      locked_root: '/tmp',
      can_change_path: true
    })
    await expect(createRemoteDirectory('/tmp/new folder', { profile: 'astra' })).resolves.toEqual({
      canChangePath: true,
      entry: {
        kind: 'directory',
        mimeType: null,
        modifiedAt: 1712345678,
        name: 'new folder',
        path: '/tmp/new folder'
      },
      lockedRoot: '/tmp',
      ok: true,
      path: '/tmp/new folder',
      root: '/tmp'
    })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: { path: '/tmp/new folder' },
      method: 'POST',
      path: '/api/files/mkdir',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({
      ok: true,
      path: '/tmp/note.txt',
      entry: {
        is_directory: false,
        mime_type: 'text/plain',
        mtime: 1712345680,
        name: 'note.txt',
        path: '/tmp/note.txt',
        size: 5
      },
      can_change_path: false
    })
    await expect(
      writeRemoteFileDataUrl(
        { dataUrl: 'data:text/plain;base64,aGVsbG8=', overwrite: false, path: '/tmp/note.txt' },
        'astra'
      )
    ).resolves.toMatchObject({
      entry: { kind: 'file', mimeType: 'text/plain', name: 'note.txt', path: '/tmp/note.txt', size: 5 },
      ok: true,
      path: '/tmp/note.txt'
    })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: { data_url: 'data:text/plain;base64,aGVsbG8=', overwrite: false, path: '/tmp/note.txt' },
      method: 'POST',
      path: '/api/files/upload',
      profile: 'astra'
    })

    const uploadBlob = new Blob(['hello'], { type: 'text/plain' })
    mockDashboardRequest.mockResolvedValueOnce({
      ok: true,
      path: '/tmp/upload.txt',
      entry: { is_directory: false, name: 'upload.txt', path: '/tmp/upload.txt', size: 5 }
    })
    await expect(
      uploadRemoteFile({ file: uploadBlob, fileName: 'upload.txt', overwrite: false, path: '/tmp/upload.txt' }, 'astra')
    ).resolves.toMatchObject({
      entry: { kind: 'file', name: 'upload.txt', path: '/tmp/upload.txt', size: 5 },
      ok: true,
      path: '/tmp/upload.txt'
    })
    const uploadRequest = lastDashboardRequest()
    expect(uploadRequest).toMatchObject({
      method: 'POST',
      path: '/api/files/upload-stream',
      profile: 'astra'
    })
    expect(uploadRequest.body).toBeInstanceOf(FormData)
    const form = uploadRequest.body as FormData
    expect(form.get('path')).toBe('/tmp/upload.txt')
    expect(form.get('overwrite')).toBe('false')
    expect(form.get('file')).toBeInstanceOf(Blob)
    expect((form.get('file') as File).name).toBe('upload.txt')

    mockDashboardRequest.mockResolvedValueOnce({
      can_change_path: true,
      data_url: 'data:text/plain;base64,aGVsbG8=',
      locked_root: '/tmp',
      mime_type: 'text/plain',
      name: 'note.txt',
      path: '/tmp/note.txt',
      root: '/tmp',
      size: 5
    })
    await expect(readRemoteManagedFileDataUrl('/tmp/note.txt', 'astra')).resolves.toEqual({
      canChangePath: true,
      dataUrl: 'data:text/plain;base64,aGVsbG8=',
      lockedRoot: '/tmp',
      mimeType: 'text/plain',
      name: 'note.txt',
      path: '/tmp/note.txt',
      root: '/tmp',
      size: 5
    })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/files/read?path=%2Ftmp%2Fnote.txt',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({ ok: true, path: '/tmp/stale.txt', can_change_path: true })
    await expect(deleteRemotePath('/tmp/stale.txt', { profile: 'astra', recursive: true })).resolves.toEqual({
      canChangePath: true,
      ok: true,
      path: '/tmp/stale.txt'
    })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      body: { path: '/tmp/stale.txt', recursive: true },
      method: 'DELETE',
      path: '/api/files',
      profile: 'astra'
    })
  })

  it('normalizes managed remote filesystem action errors', async () => {
    const { createRemoteDirectory, isRemoteFileActionError } = await import('../../../hermes/files/index')
    mockDashboardRequest.mockRejectedValueOnce(new Error('dashboard request returned 404: File not found'))

    let thrown: unknown
    try {
      await createRemoteDirectory('/tmp/missing', 'astra')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      action: 'create-directory',
      message: 'Could not create remote directory: dashboard request returned 404: File not found',
      name: 'RemoteFileActionError'
    })
    expect(isRemoteFileActionError(thrown)).toBe(true)
  })
})
