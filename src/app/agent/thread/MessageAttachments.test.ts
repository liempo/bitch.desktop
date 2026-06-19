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

  it('hydrates path attachments through the remote filesystem data-url bridge', () => {
    expect(messageAttachmentsSource).toContain('readRemoteFileDataUrl')
    expect(messageAttachmentsSource).not.toContain(['box', 'Url', 'For', 'Agent', 'Path'].join(''))
    expect(messageAttachmentsSource).not.toContain(['gateway', 'Media', 'Data', 'Url'].join(''))
  })
})
