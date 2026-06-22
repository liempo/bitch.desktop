import { describe, expect, it, vi } from 'vitest'
import assetsPageSource from '@/app/assets/AssetsPage.svelte?raw'
import markdownSource from '@/app/components/conversation/Markdown.svelte?raw'
import messageAttachmentsSource from '@/app/components/conversation/MessageAttachments.svelte?raw'
import previewSidebarSource from '@/app/agent/preview/AgentPreviewSidebar.svelte?raw'
import * as transitionalFiles from '$lib/hermes/files'
import * as hermesFiles from '$lib/hermes/files'
import { createHermesRemoteFilesAdapter } from './adapters/hermes-remote-files-adapter'
import { listRemoteDirectory } from './application/list-remote-directory'
import { resolveRemoteFileDataUrl, resolveRemoteFileText } from './application/resolve-file-preview'
import { createUnavailableLocalFilesPort } from './ports/local-files-port'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/hermes/shared/adapters/dashboard-api-client', () => ({
  dashboardRequest: mockDashboardRequest
}))

describe('Hermes files lane module shape', () => {
  it('publishes the Hermes files API from the new lane while preserving transitional re-exports', () => {
    expect(hermesFiles.parseHermesFileRef).toBeTypeOf('function')
    expect(hermesFiles.renderPreviewMediaReferences).toBeTypeOf('function')
    expect(hermesFiles.filePresentation).toBeTypeOf('function')
    expect(hermesFiles.fetchRemoteFileListing).toBe(transitionalFiles.fetchRemoteFileListing)
    expect(hermesFiles.readRemoteFileText).toBe(transitionalFiles.readRemoteFileText)
  })

  it('routes remote filesystem reads through the injectable Hermes dashboard adapter', async () => {
    const adapter = createHermesRemoteFilesAdapter()

    mockDashboardRequest.mockResolvedValueOnce({
      entries: [{ isDirectory: false, name: 'note.md', path: '/tmp/note.md' }]
    })
    await expect(listRemoteDirectory('/tmp', adapter, 'astra')).resolves.toEqual({
      entries: [{ kind: 'file', name: 'note.md', path: '/tmp/note.md' }],
      path: '/tmp'
    })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/list?path=%2Ftmp',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({ text: 'hello', path: '/tmp/note.md', binary: false })
    await expect(resolveRemoteFileText('/tmp/note.md', adapter, 'astra')).resolves.toMatchObject({ text: 'hello' })
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/read-text?path=%2Ftmp%2Fnote.md',
      profile: 'astra'
    })

    mockDashboardRequest.mockResolvedValueOnce({ data_url: 'data:text/plain;base64,aGVsbG8=' })
    await expect(resolveRemoteFileDataUrl('/tmp/note.md', adapter, 'astra')).resolves.toBe(
      'data:text/plain;base64,aGVsbG8='
    )
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/fs/read-data-url?path=%2Ftmp%2Fnote.md',
      profile: 'astra'
    })
  })

  it('keeps local filesystem access as an explicit unavailable placeholder', async () => {
    const localFiles = createUnavailableLocalFilesPort()

    await expect(localFiles.list('/tmp')).rejects.toThrow(/remote-only/i)
    await expect(localFiles.readText('/tmp/note.md')).rejects.toThrow(/remote-only/i)
    await expect(localFiles.readDataUrl('/tmp/note.md')).rejects.toThrow(/remote-only/i)
  })

  it('migrates renderer file consumers to the Hermes files public entrypoint', () => {
    for (const source of [assetsPageSource, markdownSource, messageAttachmentsSource, previewSidebarSource]) {
      expect(source).toContain('$lib/hermes/files')
      expect(source).not.toContain('$lib/hermes/files/')
    }
  })
})
