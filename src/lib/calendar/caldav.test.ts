import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

import { createTauriCalDavFetch, resolveCalendarConnection } from './caldav'

describe('CalDAV Tauri transport', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('resolves calendar connection metadata without exposing credentials', async () => {
    mockInvoke.mockResolvedValueOnce({
      authMode: 'basic',
      baseUrl: 'http://127.0.0.1:5232',
      configured: true,
      passwordPresent: true,
      profile: 'default',
      timezone: 'America/New_York',
      usernamePresent: true
    })

    await expect(resolveCalendarConnection('default')).resolves.toEqual({
      authMode: 'basic',
      baseUrl: 'http://127.0.0.1:5232',
      configured: true,
      passwordPresent: true,
      profile: 'default',
      timezone: 'America/New_York',
      usernamePresent: true
    })

    expect(mockInvoke).toHaveBeenCalledWith('resolve_calendar_connection', { profile: 'default' })
  })

  it('reports a useful error when the desktop Tauri bridge is unavailable', async () => {
    mockInvoke.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'invoke')"))

    await expect(resolveCalendarConnection('default')).rejects.toThrow(
      'Calendar CalDAV bridge is unavailable outside the BITCH desktop shell.'
    )
  })

  it('proxies CalDAV REPORT requests through the native bridge for CORS-safe tsdav fetches', async () => {
    mockInvoke.mockResolvedValueOnce({
      body: '<multistatus />',
      headers: { 'content-type': 'application/xml; charset=utf-8', etag: '"abc"' },
      status: 207,
      statusText: 'Multi-Status',
      url: 'http://127.0.0.1:5232/liempo/calendar/'
    })

    const response = await createTauriCalDavFetch('default')('http://127.0.0.1:5232/liempo/calendar/', {
      body: '<calendar-query />',
      headers: {
        Accept: 'application/xml',
        'Content-Type': 'application/xml; charset=utf-8'
      },
      method: 'REPORT'
    })

    expect(mockInvoke).toHaveBeenCalledWith('calendar_request', {
      profile: 'default',
      request: {
        body: '<calendar-query />',
        headers: {
          accept: 'application/xml',
          'content-type': 'application/xml; charset=utf-8'
        },
        method: 'REPORT',
        url: 'http://127.0.0.1:5232/liempo/calendar/'
      }
    })
    expect(response.status).toBe(207)
    expect(response.headers.get('content-type')).toContain('application/xml')
    await expect(response.text()).resolves.toBe('<multistatus />')
  })
})
