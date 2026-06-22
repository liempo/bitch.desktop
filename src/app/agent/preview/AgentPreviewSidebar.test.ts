import { describe, expect, it } from 'vitest'
import agentShellSource from '../AgentShell.svelte?raw'
import markdownSource from '../../components/conversation/Markdown.svelte?raw'
import previewSidebarSource from './AgentPreviewSidebar.svelte?raw'

describe('AgentPreviewSidebar source contract', () => {
  it('renders canvas, image, pdf, audio, video, html, and text previews in the same right sidebar', () => {
    expect(previewSidebarSource).toContain("preview.kind === 'canvas'")
    expect(previewSidebarSource).toContain('<iframe')
    expect(previewSidebarSource).toContain('src={activeUrl}')
    expect(previewSidebarSource).toContain('sandbox="allow-scripts allow-forms allow-popups allow-downloads"')
    expect(previewSidebarSource).toContain("activeViewerKind === 'image'")
    expect(previewSidebarSource).toContain("activeViewerKind === 'pdf'")
    expect(previewSidebarSource).toContain("activeViewerKind === 'audio'")
    expect(previewSidebarSource).toContain("activeViewerKind === 'video'")
    expect(previewSidebarSource).toContain("activeViewerKind === 'text'")
  })

  it('loads remote preview bytes through authenticated filesystem bridge helpers', () => {
    expect(previewSidebarSource).toContain('readRemoteFileText')
    expect(previewSidebarSource).toContain('readRemoteFileDataUrl')
    expect(previewSidebarSource).not.toContain(['VITE', 'BOX', 'BASE_URL'].join('_'))
    expect(previewSidebarSource).not.toContain(['BOX', 'file'].join(' '))
  })

  it('renders text returned for unknown files without blocking on the binary hint', () => {
    expect(previewSidebarSource).toContain('textPreview = result.text')
    expect(previewSidebarSource).not.toContain('Remote file is binary; text preview is unavailable.')
  })

  it('does not default file previews without viewerKind back to a no-inline-viewer state', () => {
    expect(previewSidebarSource).toContain('viewerKindForRemoteFile')
    expect(previewSidebarSource).not.toContain("activePreview.kind === 'image' ? 'image' : 'download'")
    expect(previewSidebarSource).not.toContain('No inline preview is available for this remote file type.')
  })

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

  it('does not hardcode a public file-server origin in the renderer', () => {
    expect(previewSidebarSource).not.toContain('airplane-skilift')
    expect(markdownSource).not.toContain('airplane-skilift')
  })
})
