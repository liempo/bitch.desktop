import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_BOX_BASE_URL = 'https://box.example.test'
const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/api/dashboard', () => ({
  dashboardRequest: mockDashboardRequest
}))

async function loadMediaHelpers(): Promise<typeof import('./media')> {
  vi.resetModules()
  vi.stubEnv('VITE_BOX_BASE_URL', TEST_BOX_BASE_URL)
  return import('./media')
}

describe('media path helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('passes through a plain gateway path', async () => {
    const { filePathFromMediaPath } = await loadMediaHelpers()

    expect(filePathFromMediaPath('/opt/data/.hermes/images/a.png')).toBe('/opt/data/.hermes/images/a.png')
  })

  it('decodes file URLs with encoded characters', async () => {
    const { filePathFromMediaPath } = await loadMediaHelpers()

    expect(filePathFromMediaPath('file:///tmp/a%20b.png')).toBe('/tmp/a b.png')
  })

  it('does not expose local workspace paths through markdown gateway media', async () => {
    const { isRemoteGatewayMediaPath } = await loadMediaHelpers()

    expect(isRemoteGatewayMediaPath('/opt/data/.hermes/images/a.PNG')).toBe(false)
    expect(isRemoteGatewayMediaPath('file:///tmp/a%20b.webp')).toBe(false)
    expect(isRemoteGatewayMediaPath('https://example.com/a.png')).toBe(false)
    expect(isRemoteGatewayMediaPath('data:image/png;base64,AAAA')).toBe(false)
    expect(isRemoteGatewayMediaPath('/opt/data/report.pdf')).toBe(false)
  })

  it('extracts image extensions before query strings', async () => {
    const { mediaExtension } = await loadMediaHelpers()

    expect(mediaExtension('/tmp/image.png?cache=1')).toBe('.png')
  })

  it('classifies upstream media kinds from file extensions', async () => {
    const { mediaKind } = await loadMediaHelpers()

    expect(mediaKind('/box/a.png')).toBe('image')
    expect(mediaKind('/box/a.mp3')).toBe('audio')
    expect(mediaKind('/box/a.mp4')).toBe('video')
    expect(mediaKind('/box/a.pdf')).toBe('file')
  })

  it('encodes and decodes internal media markdown hrefs', async () => {
    const { mediaMarkdownHref, mediaPathFromMarkdownHref } = await loadMediaHelpers()

    expect(mediaMarkdownHref('/box/render 1.png')).toBe('#media:%2Fbox%2Frender%201.png')
    expect(mediaPathFromMarkdownHref('#media:%2Fbox%2Frender%201.png')).toBe('/box/render 1.png')
    expect(mediaPathFromMarkdownHref('#preview:%2Fbox%2Frender%201.png')).toBeNull()
    expect(mediaPathFromMarkdownHref('#media:%E0%A4%A')).toBeNull()
  })

  it('leaves unsupported local MEDIA and @image references as text', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('MEDIA:/opt/data/.hermes/images/render.png')).toBe(
      'MEDIA:/opt/data/.hermes/images/render.png'
    )
    expect(renderPreviewMediaReferences('See @image:/tmp/screen.webp now')).toBe('See @image:/tmp/screen.webp now')
    expect(renderPreviewMediaReferences('MEDIA:/opt/data/report.pdf')).toBe('MEDIA:/opt/data/report.pdf')
    expect(renderPreviewMediaReferences('MEDIA:https://example.com/render.png')).toBe(
      '[Image: render.png](#media:https%3A%2F%2Fexample.com%2Frender.png)'
    )
  })

  it('renders /box MEDIA references as internal media links instead of preview links', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('MEDIA:/box/.hermes/images/render 1.png')).toBe(
      '[Image: render 1.png](#media:%2Fbox%2F.hermes%2Fimages%2Frender%201.png)'
    )
    expect(renderPreviewMediaReferences('clip: MEDIA:/box/videos/demo.mp4')).toBe(
      'clip: [Video: demo.mp4](#media:%2Fbox%2Fvideos%2Fdemo.mp4)'
    )
    expect(renderPreviewMediaReferences('sound: MEDIA:/box/audio/theme.ogg')).toBe(
      'sound: [Audio: theme.ogg](#media:%2Fbox%2Faudio%2Ftheme.ogg)'
    )
    expect(renderPreviewMediaReferences('artifact: MEDIA:/box/wiki/personal/notes.pdf')).toBe(
      'artifact: [File: notes.pdf](#media:%2Fbox%2Fwiki%2Fpersonal%2Fnotes.pdf)'
    )
  })

  it('leaves standalone /box paths as plain text', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('/box/report.pdf')).toBe('/box/report.pdf')
    expect(renderPreviewMediaReferences('Preview ready:\n/box/.hermes/cache/render 1.png')).toBe(
      'Preview ready:\n/box/.hermes/cache/render 1.png'
    )
    expect(renderPreviewMediaReferences('Report:\n/box/wiki/personal/notes.pdf')).toBe(
      'Report:\n/box/wiki/personal/notes.pdf'
    )
    expect(renderPreviewMediaReferences('Notes:\n/box/wiki/personal/readme.txt')).toBe(
      'Notes:\n/box/wiki/personal/readme.txt'
    )
  })

  it('turns explicit @file references into preview links and leaves @local unsupported', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('See @file:/box/report.pdf')).toBe(
      'See [report.pdf](#preview:%2Fbox%2Freport.pdf)'
    )
    expect(renderPreviewMediaReferences('See @local:`/opt/data/report 1.pdf`')).toBe(
      'See @local:`/opt/data/report 1.pdf`'
    )
    expect(renderPreviewMediaReferences('See @file:/opt/data/report.pdf')).toBe('See @file:/opt/data/report.pdf')
    expect(renderPreviewMediaReferences('Open @file:/box/reports/a.pdf, please')).toBe(
      'Open [a.pdf](#preview:%2Fbox%2Freports%2Fa.pdf), please'
    )
    expect(renderPreviewMediaReferences('MEDIA:/box/render.png')).not.toContain('#preview')
  })

  it('covers the rollout smoke matrix for raw, preview, inline, and legacy refs', async () => {
    const { mediaHtmlForMarkdownHref, mediaMarkdownHref, renderPreviewMediaReferences } = await loadMediaHelpers()
    const smokeText = [
      '/box/raw.png',
      '@file:/box/report.pdf',
      '@file:`/box/report 1.pdf`',
      '@local:/opt/data/render.png',
      '@file:/opt/data/render.png',
      'MEDIA:/box/render.png',
      'MEDIA:/box/audio.mp3',
      'MEDIA:/box/video.mp4',
      '@image:/box/legacy.png'
    ].join('\n')

    expect(renderPreviewMediaReferences(smokeText)).toBe(
      [
        '/box/raw.png',
        '[report.pdf](#preview:%2Fbox%2Freport.pdf)',
        '[report 1.pdf](#preview:%2Fbox%2Freport%201.pdf)',
        '@local:/opt/data/render.png',
        '@file:/opt/data/render.png',
        '[Image: render.png](#media:%2Fbox%2Frender.png)',
        '[Audio: audio.mp3](#media:%2Fbox%2Faudio.mp3)',
        '[Video: video.mp4](#media:%2Fbox%2Fvideo.mp4)',
        '[Image: legacy.png](#media:%2Fbox%2Flegacy.png)'
      ].join('\n')
    )

    const missingVideo = mediaHtmlForMarkdownHref(
      mediaMarkdownHref('/box/missing-video.mp4'),
      'Video: missing-video.mp4'
    )
    expect(missingVideo).toContain('data-media-kind="video"')
    expect(missingVideo).toContain('src="https://box.example.test/missing-video.mp4"')

    const missingPdf = mediaHtmlForMarkdownHref(mediaMarkdownHref('/box/missing.pdf'), 'File: missing.pdf')
    expect(missingPdf).toContain('data-media-kind="file"')
    expect(missingPdf).toContain('<a href="https://box.example.test/missing.pdf"')

    const missingLocalImage = mediaHtmlForMarkdownHref(mediaMarkdownHref('/opt/data/missing.png'), 'Image: missing.png')
    expect(missingLocalImage).toBeNull()
  })

  it('renders internal media markdown hrefs as inline media html', async () => {
    const { mediaHtmlForMarkdownHref, mediaMarkdownHref } = await loadMediaHelpers()

    const image = mediaHtmlForMarkdownHref(mediaMarkdownHref('/box/render.png'), 'Image: render.png')
    expect(image).toContain('data-media-kind="image"')
    expect(image).toContain('<img')
    expect(image).toContain('src="https://box.example.test/render.png"')

    const localImage = mediaHtmlForMarkdownHref(mediaMarkdownHref('/opt/data/render.png'), 'Image: render.png')
    expect(localImage).toBeNull()

    const audio = mediaHtmlForMarkdownHref(mediaMarkdownHref('/box/theme.mp3'), 'Audio: theme.mp3')
    expect(audio).toContain('data-media-kind="audio"')
    expect(audio).toContain('<audio controls preload="metadata"')

    const video = mediaHtmlForMarkdownHref(mediaMarkdownHref('/box/demo.mp4'), 'Video: demo.mp4')
    expect(video).toContain('data-media-kind="video"')
    expect(video).toContain('<video controls')

    const file = mediaHtmlForMarkdownHref(mediaMarkdownHref('/box/report.pdf'), 'File: report.pdf')
    expect(file).toContain('data-media-kind="file"')
    expect(file).toContain('<a href="https://box.example.test/report.pdf"')
    expect(file).not.toContain('data-preview-source')
  })

  it('fetches gateway media through the authenticated dashboard bridge', async () => {
    const { gatewayMediaDataUrl } = await loadMediaHelpers()
    mockDashboardRequest.mockResolvedValueOnce({ data_url: 'data:image/png;base64,ZHVtbXk=' })

    await expect(gatewayMediaDataUrl('/opt/data/.hermes/images/a b.png', 'astra')).resolves.toBe(
      'data:image/png;base64,ZHVtbXk='
    )
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/media?path=%2Fopt%2Fdata%2F.hermes%2Fimages%2Fa%20b.png',
      profile: 'astra'
    })
  })
})
