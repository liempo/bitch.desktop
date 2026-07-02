// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MessageAttachments from '../../../components/conversation/MessageAttachments.svelte'
import type { ConversationAttachment } from '$lib/hermes/conversations'
import { readRemoteFileDataUrl } from '$lib/hermes/files'

vi.mock('$lib/hermes/files', () => ({
  readRemoteFileDataUrl: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MessageAttachments UI', () => {
  it('renders inline attachment previews for every supported attachment kind', () => {
    const attachments: ConversationAttachment[] = [
      { dataUrl: 'data:image/png;base64,AAAA', id: 'image-1', kind: 'image', label: 'panel.png' },
      { dataUrl: 'data:audio/mpeg;base64,BBBB', id: 'audio-1', kind: 'audio', label: 'voice.mp3' },
      { dataUrl: 'data:video/mp4;base64,CCCC', id: 'video-1', kind: 'video', label: 'clip.mp4' },
      { dataUrl: 'data:application/pdf;base64,DDDD', id: 'pdf-1', kind: 'pdf', label: 'brief.pdf' },
      { dataUrl: 'data:application/zip;base64,EEEE', id: 'file-1', kind: 'file', label: 'archive.zip' }
    ]

    const { container } = render(MessageAttachments, { attachments })

    expect(screen.getByLabelText('Message attachments')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'panel.png' })).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(container.querySelector('audio[src="data:audio/mpeg;base64,BBBB"]')).toBeInTheDocument()
    expect(container.querySelector('video[src="data:video/mp4;base64,CCCC"]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open attachment brief.pdf' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open attachment archive.zip' })).toBeEnabled()
  })

  it('hydrates path-backed attachment previews through the remote filesystem bridge', async () => {
    vi.mocked(readRemoteFileDataUrl).mockResolvedValue('data:image/png;base64,REMOTE')

    render(MessageAttachments, {
      attachments: [{ id: 'remote-image', kind: 'image', label: 'Remote graph', path: '/box/graphs/remote.png' }],
      profile: 'astra'
    })

    expect(screen.getByRole('status', { name: 'Loading image preview…' })).toBeInTheDocument()

    const image = await screen.findByRole('img', { name: 'Remote graph' })
    expect(image).toHaveAttribute('src', 'data:image/png;base64,REMOTE')
    expect(readRemoteFileDataUrl).toHaveBeenCalledWith('/box/graphs/remote.png', 'astra')
  })

  it('opens image attachments in a modal viewer with download and close controls', async () => {
    const user = userEvent.setup()

    render(MessageAttachments, {
      attachments: [{ dataUrl: 'data:image/png;base64,AAAA', id: 'image-1', kind: 'image', label: 'panel.png' }]
    })

    await user.click(screen.getByRole('button', { name: 'Open attachment panel.png' }))

    const dialog = screen.getByRole('dialog', { name: 'Attachment viewer: panel.png' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('link', { name: 'Download attachment' })).toHaveAttribute('download', 'panel.png')
    expect(within(dialog).getByRole('img', { name: 'panel.png' })).toHaveAttribute('src', 'data:image/png;base64,AAAA')

    await user.click(screen.getByRole('button', { name: 'Close attachment viewer' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Attachment viewer: panel.png' })).not.toBeInTheDocument()
    })
  })

  it('shows the generic file fallback inside the viewer instead of pretending there is an inline renderer', async () => {
    const user = userEvent.setup()

    render(MessageAttachments, {
      attachments: [{ dataUrl: 'data:application/zip;base64,EEEE', id: 'file-1', kind: 'file', label: 'archive.zip' }]
    })

    await user.click(screen.getByRole('button', { name: 'Open attachment archive.zip' }))

    expect(screen.getByRole('dialog', { name: 'Attachment viewer: archive.zip' })).toBeInTheDocument()
    expect(screen.getByText('File preview unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download archive.zip' })).toHaveAttribute('download', 'archive.zip')
  })
})
