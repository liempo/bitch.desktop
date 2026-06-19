import { describe, expect, it } from 'vitest'
import messageAttachmentsSource from './MessageAttachments.svelte?raw'

describe('MessageAttachments source contract', () => {
  it('opens attachments through a full-screen dialog viewer', () => {
    expect(messageAttachmentsSource).toContain('openAttachment')
    expect(messageAttachmentsSource).toContain('role="dialog"')
    expect(messageAttachmentsSource).toContain('aria-modal="true"')
    expect(messageAttachmentsSource).toContain('fixed inset-0')
  })

  it('offers a download icon button from the full-screen viewer', () => {
    expect(messageAttachmentsSource).toContain('aria-label="Download attachment"')
    expect(messageAttachmentsSource).toContain('download={downloadName(activeAttachment)}')
  })

  it('hydrates all path-backed attachment previews through the remote filesystem bridge', () => {
    expect(messageAttachmentsSource).toContain('readRemoteFileDataUrl')
    expect(messageAttachmentsSource).toContain('attachment.path')
    expect(messageAttachmentsSource).not.toContain(['VITE', 'BOX', 'BASE_URL'].join('_'))
    expect(messageAttachmentsSource).not.toContain('dufs')
  })

  it('renders image, audio, video, pdf, and generic file attachment fallbacks', () => {
    expect(messageAttachmentsSource).toContain("attachment.kind === 'image'")
    expect(messageAttachmentsSource).toContain("attachment.kind === 'audio'")
    expect(messageAttachmentsSource).toContain("attachment.kind === 'video'")
    expect(messageAttachmentsSource).toContain("attachment.kind === 'pdf'")
    expect(messageAttachmentsSource).toContain("attachment.kind === 'file'")
    expect(messageAttachmentsSource).toContain('<audio')
    expect(messageAttachmentsSource).toContain('<video')
    expect(messageAttachmentsSource).toContain('File preview unavailable')
  })
})
