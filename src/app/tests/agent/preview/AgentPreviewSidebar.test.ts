import { describe, expect, it } from 'vitest'
import agentShellSource from '../../../agent/AgentShell.svelte?raw'
import markdownSource from '../../../components/conversation/Markdown.svelte?raw'
import previewSidebarSource from '../../../agent/preview/AgentPreviewSidebar.svelte?raw'

describe('Agent preview source contracts', () => {
  it('is wired as a conditional preview sidebar from the agent shell', () => {
    expect(agentShellSource).toContain('AgentPreviewSidebar')
    expect(agentShellSource).not.toContain('CanvasSidebar')
    expect(agentShellSource).toContain('{#if activePreview}')
    expect(agentShellSource).toContain('preview={activePreview}')
    expect(agentShellSource).toContain('profile={composerProfileName}')
    expect(agentShellSource).toContain('onOpenPreview={openPreview}')
  })

  it('turns explicit remote-file markdown hrefs into preview-opening links', () => {
    expect(markdownSource).toContain('renderer.link')
    expect(markdownSource).toContain('data-preview-source')
    expect(markdownSource).toContain('handleMarkdownClick')
    expect(markdownSource).toContain('onOpenPreview?.(preview)')
    expect(markdownSource).toContain('previewAnchorForPath')
    expect(markdownSource).toContain('readRemoteFileDataUrl')
    expect(markdownSource).not.toContain('boxPreviewAnchor')
  })

  it('opens inline MEDIA image, video, and PDF previews through one overlay contract', () => {
    expect(markdownSource).toContain('activeMediaOverlay')
    expect(markdownSource).toContain('data-media-overlay-source')
    expect(markdownSource).toContain('handleMediaOverlayClick')
    expect(markdownSource).toContain("activeMediaOverlay.kind === 'image'")
    expect(markdownSource).toContain("activeMediaOverlay.kind === 'video'")
    expect(markdownSource).toContain("activeMediaOverlay.kind === 'pdf'")
  })

  it('does not hardcode a public file-server origin in the renderer preview path', () => {
    expect(previewSidebarSource).not.toContain('airplane-skilift')
    expect(markdownSource).not.toContain('airplane-skilift')
    expect(previewSidebarSource).not.toContain(['VITE', 'BOX', 'BASE_URL'].join('_'))
  })
})
