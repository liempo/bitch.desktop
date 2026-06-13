import { describe, expect, it } from 'vitest'
import messageAttachmentsSource from './MessageAttachments.svelte?raw'

describe('MessageAttachments full-screen viewer contract', () => {
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
})
