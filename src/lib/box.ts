function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export const BOX_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_BOX_BASE_URL ?? '')

export type BoxEntryKind = 'directory' | 'file'

export interface RawDufsEntry {
  mtime?: number
  name?: unknown
  path_type?: unknown
  size?: number
}

export interface RawDufsListing {
  allow_search?: boolean
  href?: unknown
  paths?: unknown
}

export interface BoxEntry {
  kind: BoxEntryKind
  mtime?: number
  name: string
  path: string
  size?: number
  url: string
}

export interface BoxListing {
  allowSearch: boolean
  entries: BoxEntry[]
  path: string
}

export interface FetchBoxListingOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function sourcePath(value: string): string {
  const trimmed = value.trim()

  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname)
    } catch {
      return trimmed.replace(/^file:\/\//, '')
    }
  }

  return trimmed
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(safeDecodeURIComponent(segment)))
    .join('/')
}

function normalizeDufsPath(path: string): string {
  const trimmed = path.trim()

  if (!trimmed || trimmed === '/') return '/'

  return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

function joinDufsPath(basePath: string, name: string): string {
  const base = normalizeDufsPath(basePath)
  const cleanName = name.replace(/^\/+/, '').replace(/\/+$/, '')

  if (!cleanName) return base
  if (base === '/') return `/${cleanName}`

  return `${base}/${cleanName}`
}

function requireBoxBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)

  if (!normalized) {
    throw new Error('VITE_BOX_BASE_URL is not configured. Declare it in .env.')
  }

  return normalized
}

function boxUrlForDufsPath(path: string, baseUrl = BOX_BASE_URL, directory = false): string {
  const normalized = normalizeDufsPath(path)
  const encoded = encodePath(normalized)
  const configuredBaseUrl = requireBoxBaseUrl(baseUrl)
  const url = new URL(encoded, configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`)

  if (directory && !url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url.toString()
}

export function boxUrlForAgentPath(path: string, baseUrl = BOX_BASE_URL): string | null {
  const filePath = sourcePath(path)

  if (filePath !== '/box' && !filePath.startsWith('/box/')) {
    return null
  }

  if (!normalizeBaseUrl(baseUrl)) return null

  const dufsPath = filePath === '/box' ? '/' : filePath.slice('/box'.length)
  return boxUrlForDufsPath(dufsPath, baseUrl)
}

export function boxListingUrl(path: string, baseUrl = BOX_BASE_URL): string {
  const url = new URL(boxUrlForDufsPath(path, baseUrl, true))
  url.search = 'json'
  return url.toString()
}

function rawEntries(value: unknown): RawDufsEntry[] {
  if (!Array.isArray(value)) return []

  return value.filter((entry): entry is RawDufsEntry => Boolean(entry && typeof entry === 'object'))
}

function entryKind(entry: RawDufsEntry): BoxEntryKind {
  return entry.path_type === 'Dir' ? 'directory' : 'file'
}

function entrySortKey(entry: BoxEntry): string {
  return `${entry.kind === 'directory' ? '0' : '1'}:${entry.name.toLocaleLowerCase()}`
}

export function normalizeBoxListing(raw: RawDufsListing, requestedPath: string, baseUrl = BOX_BASE_URL): BoxListing {
  const listingPath = normalizeDufsPath(typeof raw.href === 'string' ? raw.href : requestedPath)
  const entries = rawEntries(raw.paths)
    .map(entry => {
      const name = typeof entry.name === 'string' ? entry.name : ''
      if (!name) return null

      const kind = entryKind(entry)
      const path = joinDufsPath(listingPath, name)

      const boxEntry: BoxEntry = {
        kind,
        name,
        path,
        url: boxUrlForDufsPath(path, baseUrl, kind === 'directory')
      }

      if (typeof entry.mtime === 'number') boxEntry.mtime = entry.mtime
      if (typeof entry.size === 'number') boxEntry.size = entry.size

      return boxEntry
    })
    .filter((entry): entry is BoxEntry => entry !== null)
    .sort((left, right) => entrySortKey(left).localeCompare(entrySortKey(right)))

  return {
    allowSearch: raw.allow_search === true,
    entries,
    path: listingPath
  }
}

export async function fetchBoxListing(
  path: string,
  { baseUrl = BOX_BASE_URL, fetchImpl = fetch }: FetchBoxListingOptions = {}
): Promise<BoxListing> {
  const response = await fetchImpl(boxListingUrl(path, baseUrl), {
    headers: { Accept: 'application/json' }
  })

  if (!response.ok) {
    throw new Error(`BOX listing failed (${response.status})`)
  }

  const raw = (await response.json()) as RawDufsListing
  return normalizeBoxListing(raw, path, baseUrl)
}

export const boxPathHelpers = {
  boxUrlForDufsPath,
  joinDufsPath,
  normalizeDufsPath
}
