import { describe, expect, it } from 'vitest'

import {
  calendarRemoteOverride,
  connectionScopeKey,
  normalizeRemoteBaseUrl,
  profileRemoteOverride
} from './connection-config'

describe('connection-config helpers', () => {
  it('normalizes remote HTTP(S) base URLs', () => {
    expect(normalizeRemoteBaseUrl(' http://127.0.0.1:9119///?x=1#hash ')).toBe('http://127.0.0.1:9119')
    expect(normalizeRemoteBaseUrl('https://example.com/hermes///')).toBe('https://example.com/hermes')
  })

  it('rejects empty, invalid, and unsupported remote URLs', () => {
    expect(() => normalizeRemoteBaseUrl('')).toThrow('Remote gateway URL is required')
    expect(() => normalizeRemoteBaseUrl('not a url')).toThrow('Remote gateway URL is not valid')
    expect(() => normalizeRemoteBaseUrl('ws://127.0.0.1:9119')).toThrow('must be http:// or https://')
  })

  it('normalizes profile scope keys', () => {
    expect(connectionScopeKey(' crypto ')).toBe('crypto')
    expect(connectionScopeKey('')).toBeNull()
    expect(connectionScopeKey(null)).toBeNull()
  })

  it('returns token-auth remote profile overrides only for configured remote entries', () => {
    const config = {
      mode: 'remote',
      url: 'http://127.0.0.1:9119',
      token: 'global-token',
      profiles: {
        crypto: { mode: 'remote', url: 'http://127.0.0.1:9121/', token: 'profile-token' },
        localish: { mode: 'local', url: 'http://127.0.0.1:9122' },
        empty: { mode: 'remote', url: '   ' },
        oauth: { authMode: 'oauth' as const, mode: 'remote', url: 'https://example.com' }
      }
    }

    expect(profileRemoteOverride(config, ' crypto ')).toEqual({
      authMode: 'token',
      token: 'profile-token',
      url: 'http://127.0.0.1:9121/'
    })
    expect(profileRemoteOverride(config, 'oauth')).toEqual({
      authMode: 'oauth',
      token: undefined,
      url: 'https://example.com'
    })
    expect(profileRemoteOverride(config, 'localish')).toBeNull()
    expect(profileRemoteOverride(config, 'empty')).toBeNull()
    expect(profileRemoteOverride(config, 'missing')).toBeNull()
  })

  it('keeps CalDAV credentials in the same global/profile connection settings model', () => {
    const config = {
      calendar: {
        password: 'global-secret',
        timezone: 'UTC',
        url: 'http://127.0.0.1:5232/dav/',
        username: 'global-user'
      },
      profiles: {
        work: {
          mode: 'remote',
          url: 'http://127.0.0.1:9119',
          calendar: {
            password: 'profile-secret',
            timezone: 'America/New_York',
            url: 'http://127.0.0.1:5233/work/',
            username: 'profile-user'
          }
        },
        empty: {
          mode: 'remote',
          url: 'http://127.0.0.1:9119',
          calendar: { url: '   ' }
        }
      }
    }

    expect(calendarRemoteOverride(config, 'work')).toEqual({
      authMode: 'basic',
      password: 'profile-secret',
      timezone: 'America/New_York',
      url: 'http://127.0.0.1:5233/work/',
      username: 'profile-user'
    })
    expect(calendarRemoteOverride(config, 'empty')).toEqual({
      authMode: 'basic',
      password: 'global-secret',
      timezone: 'UTC',
      url: 'http://127.0.0.1:5232/dav/',
      username: 'global-user'
    })
    expect(calendarRemoteOverride(config, 'missing')).toEqual({
      authMode: 'basic',
      password: 'global-secret',
      timezone: 'UTC',
      url: 'http://127.0.0.1:5232/dav/',
      username: 'global-user'
    })
  })
})
