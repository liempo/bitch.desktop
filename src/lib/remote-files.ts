import { dashboardRequest } from '$lib/api/dashboard'

export type RemoteFileHrefMode = 'media' | 'preview'
type RemoteFileEntryKind = 'directory' | 'file'
export type RemoteFileViewerKind = 'audio' | 'download' | 'html' | 'image' | 'pdf' | 'text' | 'video'

export interface HermesFileRef {
  path: string
  range?: string
  refText: string
}

export interface HermesFileReference {
  path: string
  range?: string
  source: string
}

export interface RemoteFileHrefSource {
  mode: RemoteFileHrefMode
  path: string
}

export interface RemoteFileEntry {
  kind: RemoteFileEntryKind
  name: string
  path: string
  size?: number
}

export interface RemoteFileListing {
  entries: RemoteFileEntry[]
  error?: string
  path: string
}

export interface RemoteFileTextResponse {
  binary: boolean
  byteSize?: number
  language?: string
  mimeType?: string
  path: string
  text: string
  truncated?: boolean
}

interface RawRemoteFileEntry {
  isDirectory?: unknown
  name?: unknown
  path?: unknown
  size?: unknown
}

interface RawRemoteFileListing {
  entries?: unknown
  error?: unknown
}

interface RawRemoteFileDataUrlResponse {
  data_url?: unknown
  dataUrl?: unknown
}

const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const AUDIO_EXTENSIONS = new Set(['.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav'])
const VIDEO_EXTENSIONS = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm'])
const PDF_EXTENSIONS = new Set(['.pdf'])
const HTML_EXTENSIONS = new Set(['.htm', '.html'])
const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.env',
  '.ini',
  '.json',
  '.jsonl',
  '.log',
  '.md',
  '.markdown',
  '.toml',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
])
const CODE_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.css',
  '.go',
  '.h',
  '.java',
  '.js',
  '.jsx',
  '.kt',
  '.lua',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.svelte',
  '.swift',
  '.ts',
  '.tsx',
  '.vue'
])

const DENIED_DIR_NAMES = new Set(['.aws', '.azure', '.docker', '.gnupg', '.kube', '.ssh'])
const DENIED_FILE_NAMES = new Set(['.netrc', '.npmrc', '.pgpass', '.pypirc'])

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizedProfile(profile?: null | string): string | undefined {
  return profile?.trim() || undefined
}

function profileFromOptions(profile?: null | string | { profile?: null | string }): null | string | undefined {
  return typeof profile === 'object' && profile !== null ? profile.profile : profile
}

function requestOptions(
  path: string,
  profile?: null | string | { profile?: null | string }
): { path: string; profile?: string } {
  const activeProfile = normalizedProfile(profileFromOptions(profile))
  return activeProfile ? { path, profile: activeProfile } : { path }
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;!?]+$/, '').trim()
}

function unquoteDirectiveValue(rawValue: string): { path: string; rest: string } | null {
  const value = rawValue.trim()
  if (!value) return null

  const quote = value[0]
  if (quote === '`' || quote === '"' || quote === "'") {
    const end = value.indexOf(quote, 1)
    if (end < 0) return null
    return {
      path: value.slice(1, end),
      rest: value.slice(end + 1).trim()
    }
  }

  return { path: stripTrailingPunctuation(value), rest: '' }
}

function splitRange(pathValue: string, rest: string): { path: string; range?: string } {
  const externalRange = rest.match(/^:(\d+(?:-\d+)?)$/)?.[1]
  if (externalRange) return { path: pathValue, range: externalRange }

  const inlineRange = pathValue.match(/^(.+):(\d+(?:-\d+)?)$/)
  if (inlineRange) return { path: inlineRange[1], range: inlineRange[2] }

  return { path: pathValue }
}

export function filePathFromRemoteSource(source: string): string {
  const trimmed = source.trim()

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      if (url.protocol === 'file:' && (!url.hostname || url.hostname === 'localhost')) {
        return safeDecodeURIComponent(url.pathname)
      }
      return trimmed
    } catch {
      return safeDecodeURIComponent(trimmed.replace(/^file:\/\//i, ''))
    }
  }

  return trimmed
}

export function isAbsoluteRemoteFilePath(source: string): boolean {
  const path = filePathFromRemoteSource(source)
  return path.startsWith('/') || path === '~' || path.startsWith('~/')
}

export function parseHermesFileReference(value: string): HermesFileReference | null {
  const parsed = unquoteDirectiveValue(value)
  if (!parsed) return null

  const { path, range } = splitRange(filePathFromRemoteSource(parsed.path), parsed.rest)
  if (!isAbsoluteRemoteFilePath(path)) return null

  return {
    path,
    ...(range ? { range } : {}),
    source: range ? `${path}:${range}` : path
  }
}

export function parseHermesFileRef(value: string): HermesFileRef | null {
  const trimmed = value.trim()
  const match = trimmed.match(/^@file:(.*)$/i)
  if (!match) return null

  const parsed = unquoteDirectiveValue(match[1])
  if (!parsed) return null

  const { path, range } = splitRange(filePathFromRemoteSource(parsed.path), parsed.rest)
  if (!isAbsoluteRemoteFilePath(path)) return null

  return {
    path,
    ...(range ? { range } : {}),
    refText: trimmed
  }
}

export function remoteFileExtension(source: string): string {
  const file = filePathFromRemoteSource(source).split(/[?#]/, 1)[0] ?? ''
  const name = file.split(/[\\/]/).pop() ?? file
  const dot = name.lastIndexOf('.')

  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function remoteFileLabel(source: string): string {
  const file = filePathFromRemoteSource(source).split(/[?#]/, 1)[0] ?? ''
  const label = file.split(/[\\/]/).filter(Boolean).pop()
  return label ? safeDecodeURIComponent(label) : file || source
}

export function remoteFileMediaKind(source: string): 'audio' | 'file' | 'image' | 'video' {
  const viewerKind = viewerKindForRemoteFile(source)
  if (viewerKind === 'audio' || viewerKind === 'image' || viewerKind === 'video') return viewerKind
  return 'file'
}

export function viewerKindForRemoteFile(source: string): RemoteFileViewerKind {
  const extension = remoteFileExtension(source)

  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (PDF_EXTENSIONS.has(extension)) return 'pdf'
  if (HTML_EXTENSIONS.has(extension)) return 'html'
  if (TEXT_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension)) return 'text'

  return 'download'
}

export function remoteFileHref(path: string, mode: RemoteFileHrefMode = 'preview'): string {
  return `#${mode}:${encodeURIComponent(path)}`
}

export function remoteFilePreviewHref(path: string): string {
  return `#remote-file/${encodeURIComponent(path)}`
}

export function sourceFromRemoteFilePreviewHref(href: string): string | null {
  const match = href.match(/^#remote-file\/(.+)$/)
  if (!match) return null
  return safeDecodeURIComponent(match[1])
}

export function remoteFileSourceFromHref(href: string): RemoteFileHrefSource | null {
  const match = href.match(/^#(preview|media):(.+)$/)
  if (match) {
    return {
      mode: match[1] as RemoteFileHrefMode,
      path: safeDecodeURIComponent(match[2])
    }
  }

  const legacyPath = sourceFromRemoteFilePreviewHref(href)
  return legacyPath ? { mode: 'preview', path: legacyPath } : null
}

export function isDeniedRemoteFilePath(source: string): boolean {
  const path = filePathFromRemoteSource(source)
  const lowerPath = path.toLowerCase()
  const segments = lowerPath.split('/').filter(Boolean)

  if (lowerPath.includes('/.hermes/.env')) return true
  if (lowerPath.includes('/skills/.hub') || lowerPath.endsWith('/skills/.hub')) return true

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (DENIED_DIR_NAMES.has(segment)) return true
    if (DENIED_FILE_NAMES.has(segment)) return true
    if (segment === '.config' && segments[index + 1] === 'gh') return true
  }

  return false
}

function rawEntries(value: unknown): RawRemoteFileEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is RawRemoteFileEntry => Boolean(entry && typeof entry === 'object'))
}

function entrySortKey(entry: RemoteFileEntry): string {
  return `${entry.kind === 'directory' ? '0' : '1'}:${entry.name.toLocaleLowerCase()}`
}

export function normalizeRemoteFileListing(raw: RawRemoteFileListing, requestedPath: string): RemoteFileListing {
  const entries = rawEntries(raw.entries)
    .map(entry => {
      const name = typeof entry.name === 'string' ? entry.name : ''
      const path = typeof entry.path === 'string' ? entry.path : ''
      if (!name || !path) return null

      const normalized: RemoteFileEntry = {
        kind: entry.isDirectory === true ? 'directory' : 'file',
        name,
        path
      }

      if (typeof entry.size === 'number') normalized.size = entry.size
      return normalized
    })
    .filter((entry): entry is RemoteFileEntry => entry !== null)
    .sort((left, right) => entrySortKey(left).localeCompare(entrySortKey(right)))

  return {
    entries,
    ...(typeof raw.error === 'string' && raw.error ? { error: raw.error } : {}),
    path: requestedPath
  }
}

export async function fetchRemoteFileListing(
  path: string,
  profile?: null | string | { profile?: null | string }
): Promise<RemoteFileListing> {
  const remotePath = filePathFromRemoteSource(path)
  const raw = await dashboardRequest<RawRemoteFileListing>(
    requestOptions(`/api/fs/list?path=${encodeURIComponent(remotePath)}`, profileFromOptions(profile))
  )
  return normalizeRemoteFileListing(raw, remotePath)
}

export async function readRemoteFileText(path: string, profile?: null | string): Promise<RemoteFileTextResponse> {
  const remotePath = filePathFromRemoteSource(path)
  return dashboardRequest<RemoteFileTextResponse>(
    requestOptions(`/api/fs/read-text?path=${encodeURIComponent(remotePath)}`, profile)
  )
}

export async function readRemoteFileDataUrl(path: string, profile?: null | string): Promise<string> {
  const remotePath = filePathFromRemoteSource(path)
  const result = await dashboardRequest<RawRemoteFileDataUrlResponse>(
    requestOptions(`/api/fs/read-data-url?path=${encodeURIComponent(remotePath)}`, profile)
  )
  const dataUrl = result.dataUrl ?? result.data_url

  if (typeof dataUrl !== 'string' || !dataUrl) {
    throw new Error('Remote file API did not return a data URL')
  }

  return dataUrl
}

export async function getRemoteDefaultCwd(profile?: null | string): Promise<{ branch?: string; cwd: string }> {
  return dashboardRequest<{ branch?: string; cwd: string }>(requestOptions('/api/fs/default-cwd', profile))
}
