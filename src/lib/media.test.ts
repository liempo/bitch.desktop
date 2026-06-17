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

  it('detects relayable image paths without touching remote URLs or data URLs', async () => {
    const { isRemoteGatewayMediaPath } = await loadMediaHelpers()

    expect(isRemoteGatewayMediaPath('/opt/data/.hermes/images/a.PNG')).toBe(true)
    expect(isRemoteGatewayMediaPath('file:///tmp/a%20b.webp')).toBe(true)
    expect(isRemoteGatewayMediaPath('https://example.com/a.png')).toBe(false)
    expect(isRemoteGatewayMediaPath('data:image/png;base64,AAAA')).toBe(false)
    expect(isRemoteGatewayMediaPath('/opt/data/report.pdf')).toBe(false)
  })

  it('extracts image extensions before query strings', async () => {
    const { mediaExtension } = await loadMediaHelpers()

    expect(mediaExtension('/tmp/image.png?cache=1')).toBe('.png')
  })

  it('turns Hermes MEDIA and @image references into markdown image previews', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('MEDIA:/opt/data/.hermes/images/render.png')).toBe(
      '![Image: render.png](/opt/data/.hermes/images/render.png)'
    )
    expect(renderPreviewMediaReferences('See @image:/tmp/screen.webp now')).toBe(
      'See ![Image: screen.webp](/tmp/screen.webp) now'
    )
    expect(renderPreviewMediaReferences('MEDIA:/opt/data/report.pdf')).toBe('MEDIA:/opt/data/report.pdf')
  })

  it('renders /box MEDIA references as preview links instead of eager previews', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('MEDIA:/box/.hermes/images/render 1.png')).toBe(
      '[Attachment: render 1.png](/box/.hermes/images/render%201.png)'
    )
    expect(renderPreviewMediaReferences('artifact: MEDIA:/box/wiki/personal/notes.pdf')).toBe(
      'artifact: [Attachment: notes.pdf](/box/wiki/personal/notes.pdf)'
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

  it('turns explicit @file and @local references into preview links', async () => {
    const { renderPreviewMediaReferences } = await loadMediaHelpers()

    expect(renderPreviewMediaReferences('See @file:/box/report.pdf')).toBe(
      'See [report.pdf](#preview:%2Fbox%2Freport.pdf)'
    )
    expect(renderPreviewMediaReferences('See @local:`/opt/data/report 1.pdf`')).toBe(
      'See [report 1.pdf](#preview:%2Fopt%2Fdata%2Freport%201.pdf)'
    )
    expect(renderPreviewMediaReferences('Open @file:/box/reports/a.pdf, please')).toBe(
      'Open [a.pdf](#preview:%2Fbox%2Freports%2Fa.pdf), please'
    )
    expect(renderPreviewMediaReferences('MEDIA:/box/render.png')).not.toContain('#preview')
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
