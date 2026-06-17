import { describe, expect, it } from 'vitest'
import agentShellSource from '../AgentShell.svelte?raw'
import markdownSource from '../thread/Markdown.svelte?raw'
import previewSidebarSource from './PreviewSidebar.svelte?raw'

describe('PreviewSidebar source contract', () => {
  it('renders canvas HTML and image previews in the same right sidebar', () => {
    expect(previewSidebarSource).toContain("preview.kind === 'canvas'")
    expect(previewSidebarSource).toContain('<iframe')
    expect(previewSidebarSource).toContain('src={preview.url}')
    expect(previewSidebarSource).toContain('sandbox="allow-scripts allow-forms allow-popups allow-downloads"')
    expect(previewSidebarSource).toContain("preview.kind === 'image'")
    expect(previewSidebarSource).toContain('<img')
    expect(previewSidebarSource).toContain('alt={preview.label}')
  })

  it('is wired as a conditional preview sidebar from the agent shell', () => {
    expect(agentShellSource).toContain('PreviewSidebar')
    expect(agentShellSource).not.toContain('CanvasSidebar')
    expect(agentShellSource).toContain('{#if activePreview}')
    expect(agentShellSource).toContain('preview={activePreview}')
    expect(agentShellSource).toContain('onOpenPreview={openPreview}')
  })

  it('turns /box markdown hrefs into preview-opening links instead of immediate images', () => {
    expect(markdownSource).toContain('renderer.link')
    expect(markdownSource).toContain('data-preview-source')
    expect(markdownSource).toContain('handleMarkdownClick')
    expect(markdownSource).toContain('onOpenPreview?.(preview)')
    expect(markdownSource).toContain('boxPreviewAnchor')
  })

  it('routes explicit #preview links through the preview sidebar', () => {
    expect(markdownSource).toContain("href.startsWith('#preview:')")
    expect(markdownSource).toContain('previewFromFileReference')
    expect(markdownSource).toContain('decodePreviewHref')
  })

  it('does not hardcode the production BOX origin in the renderer', () => {
    expect(previewSidebarSource).not.toContain('box.airplane-skilift.ts.net')
    expect(markdownSource).not.toContain('box.airplane-skilift.ts.net')
  })
})
