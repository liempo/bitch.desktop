type ConnectionAuthMode = 'oauth' | 'token'
type ConnectionMode = 'remote'
type CalendarAuthMode = 'basic'

interface CalendarConnectionConfig {
  authMode?: CalendarAuthMode | string | null
  password?: string | null
  timezone?: string | null
  url?: string | null
  username?: string | null
}

interface ConnectionProfileConfig {
  authMode?: ConnectionAuthMode | null
  calendar?: CalendarConnectionConfig | null
  mode?: ConnectionMode | string | null
  token?: string | null
  url?: string | null
}

export interface ConnectionConfig extends ConnectionProfileConfig {
  profiles?: Record<string, ConnectionProfileConfig>
}

export interface ProfileRemoteOverride {
  authMode: ConnectionAuthMode
  token?: string | null
  url: string
}

export interface CalendarRemoteOverride {
  authMode: CalendarAuthMode
  password?: string | null
  timezone?: string | null
  url: string
  username?: string | null
}

export function normalizeRemoteBaseUrl(rawUrl: string | null | undefined): string {
  const value = String(rawUrl ?? '').trim()

  if (!value) {
    throw new Error('Remote gateway URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Remote gateway URL is not valid: ${message}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Remote gateway URL must be http:// or https://, got ${parsed.protocol}`)
  }

  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')

  return parsed.toString().replace(/\/+$/, '')
}

export function connectionScopeKey(profile: string | null | undefined): string | null {
  return String(profile ?? '').trim() || null
}

function normAuthMode(mode: string | null | undefined): ConnectionAuthMode {
  return mode === 'oauth' ? 'oauth' : 'token'
}

export function profileRemoteOverride(
  config: ConnectionConfig | null | undefined,
  profile: string | null | undefined
): ProfileRemoteOverride | null {
  const key = connectionScopeKey(profile)
  const entry = key ? config?.profiles?.[key] : null

  if (!entry || typeof entry !== 'object' || entry.mode !== 'remote') {
    return null
  }

  const url = String(entry.url ?? '').trim()
  if (!url) {
    return null
  }

  return {
    authMode: normAuthMode(entry.authMode),
    token: entry.token,
    url
  }
}

function normCalendarAuthMode(): CalendarAuthMode {
  return 'basic'
}

function usableCalendarConfig(entry: CalendarConnectionConfig | null | undefined): CalendarConnectionConfig | null {
  const url = String(entry?.url ?? '').trim()
  return url ? { ...entry, url } : null
}

export function calendarRemoteOverride(
  config: ConnectionConfig | null | undefined,
  profile: string | null | undefined
): CalendarRemoteOverride | null {
  const key = connectionScopeKey(profile)
  const profileCalendar = key ? usableCalendarConfig(config?.profiles?.[key]?.calendar) : null
  const calendar = profileCalendar ?? usableCalendarConfig(config?.calendar)

  if (!calendar) {
    return null
  }

  return {
    authMode: normCalendarAuthMode(),
    password: calendar.password,
    timezone: calendar.timezone,
    url: calendar.url ?? '',
    username: calendar.username
  }
}
