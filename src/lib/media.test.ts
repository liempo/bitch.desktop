import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/api/dashboard', () => ({
  dashboardRequest: mockDashboardRequest
}))

import { filePathFromMediaPath, gatewayMediaDataUrl, isRemoteGatewayMediaPath, mediaExtension } from './media'

describe('media path helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through a plain gateway path', () => {
    expect(filePathFromMediaPath('/opt/data/.hermes/images/a.png')).toBe('/opt/data/.hermes/images/a.png')
  })

  it('decodes file URLs with encoded characters', () => {
    expect(filePathFromMediaPath('file:///tmp/a%20b.png')).toBe('/tmp/a b.png')
  })

  it('detects relayable image paths without touching remote URLs or data URLs', () => {
    expect(isRemoteGatewayMediaPath('/opt/data/.hermes/images/a.PNG')).toBe(true)
    expect(isRemoteGatewayMediaPath('file:///tmp/a%20b.webp')).toBe(true)
    expect(isRemoteGatewayMediaPath('https://example.com/a.png')).toBe(false)
    expect(isRemoteGatewayMediaPath('data:image/png;base64,AAAA')).toBe(false)
    expect(isRemoteGatewayMediaPath('/opt/data/report.pdf')).toBe(false)
  })

  it('extracts image extensions before query strings', () => {
    expect(mediaExtension('/tmp/image.png?cache=1')).toBe('.png')
  })

  it('fetches gateway media through the authenticated dashboard bridge', async () => {
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
