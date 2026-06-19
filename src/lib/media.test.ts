import { describe, expect, it } from 'vitest'

describe('media path helpers', () => {
  it('passes through a plain gateway path', async () => {
    const { filePathFromMediaPath } = await import('./media')

    expect(filePathFromMediaPath('/opt/data/.hermes/images/a.png')).toBe('/opt/data/.hermes/images/a.png')
  })

  it('decodes file URLs with encoded characters', async () => {
    const { filePathFromMediaPath } = await import('./media')

    expect(filePathFromMediaPath('file:///tmp/a%20b.png')).toBe('/tmp/a b.png')
  })

  it('detects relayable remote media paths without touching remote URLs or data URLs', async () => {
    const { isRemoteGatewayMediaPath } = await import('./media')

    expect(isRemoteGatewayMediaPath('/opt/data/.hermes/images/a.PNG')).toBe(true)
    expect(isRemoteGatewayMediaPath('file:///tmp/a%20b.webp')).toBe(true)
    expect(isRemoteGatewayMediaPath('/tmp/sound.mp3')).toBe(true)
    expect(isRemoteGatewayMediaPath('https://example.com/a.png')).toBe(false)
    expect(isRemoteGatewayMediaPath('data:image/png;base64,AAAA')).toBe(false)
    expect(isRemoteGatewayMediaPath('/opt/data/report.pdf')).toBe(false)
  })

  it('extracts image extensions before query strings', async () => {
    const { mediaExtension } = await import('./media')

    expect(mediaExtension('/tmp/image.png?cache=1')).toBe('.png')
  })

  it('turns @file directives into internal remote preview links', async () => {
    const { renderPreviewMediaReferences } = await import('./media')

    expect(renderPreviewMediaReferences('@file:/opt/data/reports/summary.pdf')).toBe(
      '[File: summary.pdf](#preview:%2Fopt%2Fdata%2Freports%2Fsummary.pdf)'
    )
    expect(renderPreviewMediaReferences('open @file:`/tmp/hermes remote probe.txt` please')).toBe(
      'open [File: hermes remote probe.txt](#preview:%2Ftmp%2Fhermes%20remote%20probe.txt) please'
    )
  })

  it('turns MEDIA directives into remote inline media links without public file-server URL derivation', async () => {
    const { renderPreviewMediaReferences } = await import('./media')

    expect(renderPreviewMediaReferences('MEDIA:/opt/data/render.png')).toBe(
      '![Image: render.png](#media:%2Fopt%2Fdata%2Frender.png)'
    )
    expect(renderPreviewMediaReferences('@media:`/box/.hermes/cache/render 1.png`')).toBe(
      '![Image: render 1.png](#media:%2Fbox%2F.hermes%2Fcache%2Frender%201.png)'
    )
    expect(renderPreviewMediaReferences('MEDIA:/tmp/sound.mp3')).toBe('[Audio: sound.mp3](#media:%2Ftmp%2Fsound.mp3)')
    expect(renderPreviewMediaReferences('MEDIA:"/tmp/clip final.mp4"')).toBe(
      '[Video: clip final.mp4](#media:%2Ftmp%2Fclip%20final.mp4)'
    )
    expect(renderPreviewMediaReferences('MEDIA:/opt/data/report.pdf')).toBe(
      '[PDF: report.pdf](#media:%2Fopt%2Fdata%2Freport.pdf)'
    )
  })

  it('keeps raw absolute paths as plain text', async () => {
    const { renderPreviewMediaReferences } = await import('./media')

    expect(renderPreviewMediaReferences('Preview ready:\n/box/.hermes/cache/render 1.png')).toBe(
      'Preview ready:\n/box/.hermes/cache/render 1.png'
    )
    expect(renderPreviewMediaReferences('Report: /opt/data/report.pdf')).toBe('Report: /opt/data/report.pdf')
  })
})
