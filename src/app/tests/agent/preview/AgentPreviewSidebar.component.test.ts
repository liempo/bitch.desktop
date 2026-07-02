// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AgentPreviewSidebar from '../../../agent/preview/AgentPreviewSidebar.svelte'
import type { ConversationPreview } from '$lib/hermes/conversations'
import { readRemoteFileDataUrl, readRemoteFileText, viewerKindForRemoteFile } from '$lib/hermes/files'

vi.mock('$lib/hermes/files', () => ({
  readRemoteFileDataUrl: vi.fn(),
  readRemoteFileText: vi.fn(),
  viewerKindForRemoteFile: vi.fn((path: string) => {
    if (path.endsWith('.png')) return 'image'
    if (path.endsWith('.pdf')) return 'pdf'
    return 'text'
  })
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function preview(overrides: Partial<ConversationPreview>): ConversationPreview {
  return {
    kind: 'file',
    label: 'preview.txt',
    path: '/opt/data/preview.txt',
    source: '@file:/opt/data/preview.txt',
    url: null,
    viewerKind: 'text',
    ...overrides
  }
}

describe('AgentPreviewSidebar UI', () => {
  it('renders text returned from the remote bridge for unknown file previews', async () => {
    vi.mocked(readRemoteFileText).mockResolvedValue({
      binary: true,
      path: '/opt/data/debug.bin',
      text: 'opaque bytes rendered as text'
    })

    render(AgentPreviewSidebar, {
      preview: preview({ label: 'debug.bin', path: '/opt/data/debug.bin', viewerKind: 'text' }),
      profile: 'astra'
    })

    expect(
      screen.getAllByRole('status').some(status => status.getAttribute('aria-label') === 'Loading remote file preview')
    ).toBe(true)
    expect(await screen.findByText('opaque bytes rendered as text')).toBeInTheDocument()
    expect(readRemoteFileText).toHaveBeenCalledWith('/opt/data/debug.bin', 'astra')
  })

  it('renders image previews and open links from authenticated remote data URLs', async () => {
    vi.mocked(readRemoteFileDataUrl).mockResolvedValue('data:image/png;base64,REMOTE')

    render(AgentPreviewSidebar, {
      preview: preview({ kind: 'image', label: 'graph.png', path: '/box/graphs/graph.png', viewerKind: 'image' }),
      profile: 'default'
    })

    const image = await screen.findByRole('img', { name: 'graph.png' })
    expect(image).toHaveAttribute('src', 'data:image/png;base64,REMOTE')
    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute('href', 'data:image/png;base64,REMOTE')
    expect(readRemoteFileDataUrl).toHaveBeenCalledWith('/box/graphs/graph.png', 'default')
  })

  it('renders canvas URLs without remote bridge calls and keeps close behavior accessible', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { container } = render(AgentPreviewSidebar, {
      onClose,
      preview: preview({
        kind: 'canvas',
        label: 'canvas artifact',
        path: undefined,
        source: 'CANVAS:/box/render.html',
        url: 'https://dashboard/files/render.html'
      })
    })

    expect(screen.getByRole('heading', { name: 'canvas artifact' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open canvas' })).toHaveAttribute(
      'href',
      'https://dashboard/files/render.html'
    )
    expect(container.querySelector('iframe[title="canvas artifact"]')).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-popups allow-downloads'
    )
    expect(readRemoteFileDataUrl).not.toHaveBeenCalled()
    expect(readRemoteFileText).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Close preview' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('falls back to the viewer classifier when a file preview omits viewerKind', async () => {
    vi.mocked(readRemoteFileDataUrl).mockResolvedValue('data:application/pdf;base64,PDF')

    render(AgentPreviewSidebar, {
      preview: preview({ label: 'brief.pdf', path: '/box/brief.pdf', viewerKind: undefined })
    })

    await waitFor(() => {
      expect(document.querySelector('iframe[title="brief.pdf"]')).toHaveAttribute(
        'src',
        'data:application/pdf;base64,PDF'
      )
    })
    expect(viewerKindForRemoteFile).toHaveBeenCalledWith('/box/brief.pdf')
  })
})
