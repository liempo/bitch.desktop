import { describe, expect, it } from 'vitest'
import markdownSource from './Markdown.svelte?raw'

describe('Markdown media rendering contract', () => {
  it('routes internal #media markdown links through the inline media renderer before preview links', () => {
    expect(markdownSource).toContain('mediaHtmlForMarkdownHref')
    expect(markdownSource).toMatch(/const mediaHtml = mediaHtmlForMarkdownHref\(href, token\.text \|\| href\)/)
    expect(markdownSource.indexOf('mediaHtmlForMarkdownHref')).toBeLessThan(
      markdownSource.indexOf('explicitPreviewAnchor')
    )
  })

  it('allows sanitized audio and video media attributes', () => {
    expect(markdownSource).toContain("'audio'")
    expect(markdownSource).toContain("'video'")
    expect(markdownSource).toContain("'controls'")
    expect(markdownSource).toContain("'preload'")
  })
})
