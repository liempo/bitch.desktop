type ConnectionAuthMode = 'oauth' | 'token'
type ConnectionMode = 'remote'

interface ConnectionProfileConfig {
  authMode?: ConnectionAuthMode | null
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
