import { dashboardRequest } from '$lib/api/dashboard'
import { boxUrlForAgentPath } from '$lib/box'

const IMAGE_EXTENSIONS = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const AUDIO_EXTENSIONS = new Set(['.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav'])
const VIDEO_EXTENSIONS = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm'])
const MEDIA_HREF_PREFIX = '#media:'
const REMOTE_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

export type MediaKind = 'audio' | 'image' | 'video' | 'file'

export interface GatewayMediaResponse {
  data_url: string
}

export function filePathFromMediaPath(path: string): string {
  if (path.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(path).pathname)
    } catch {
      return path.replace(/^file:\/\//, '')
    }
  }

  return path
}

export function mediaExtension(path: string): string {
  const file = filePathFromMediaPath(path).split(/[?#]/, 1)[0] ?? ''
  const name = file.split(/[\\/]/).pop() ?? file
  const dot = name.lastIndexOf('.')

  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

function splitFileRef(value: string): { path: string; trailing: string } {
  const trimmed = value.trim()
  const head = trimmed[0]
  const tail = trimmed[trimmed.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  if (quoted) {
    return { path: trimmed.slice(1, -1).trim(), trailing: '' }
  }

  const trailing = trimmed.match(/[,.;!?]+$/)?.[0] ?? ''
  const path = (trailing ? trimmed.slice(0, -trailing.length) : trimmed).trim()

  return { path, trailing }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function titleCaseKind(kind: MediaKind): string {
  return `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)}`
}

function browserMediaSource(path: string): string | null {
  const value = path.trim()
  if (!value) return null

  const boxUrl = boxUrlForAgentPath(value)
  if (boxUrl) return boxUrl
  if (/^(?:https?|data|blob):/i.test(value)) return value

  return null
}

function mediaFallbackHref(path: string): string {
  return browserMediaSource(path) ?? filePathFromMediaPath(path)
}

function markdownMediaLinkForRef(rawPath: string): string | null {
  const { path, trailing } = splitFileRef(rawPath)
  if (!path) return null

  const filePath = filePathFromMediaPath(path)
  const kind = mediaKind(filePath)
  const label = escapeMarkdownLabel(`${titleCaseKind(kind)}: ${mediaName(filePath)}`)

  return `[${label}](${mediaMarkdownHref(filePath)})${trailing}`
}

export function mediaName(path: string): string {
  const file = filePathFromMediaPath(path).split(/[?#]/, 1)[0] ?? ''
  return file.split(/[\\/]/).filter(Boolean).pop() || path
}

export function mediaKind(path: string): MediaKind {
  const extension = mediaExtension(path)

  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return 'file'
}

export function mediaMarkdownHref(path: string): string {
  return `${MEDIA_HREF_PREFIX}${encodeURIComponent(path)}`
}

export function mediaPathFromMarkdownHref(href?: string): string | null {
  if (!href?.startsWith(MEDIA_HREF_PREFIX)) return null

  const encoded = href.slice(MEDIA_HREF_PREFIX.length)
  if (!encoded) return null

  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

export function isRemoteGatewayMediaPath(path: string): boolean {
  const value = path.trim()

  if (!value) return false
  if (/^(?:https?|data|blob):/i.test(value)) return false

  return mediaKind(value) === 'image'
}

export function mediaHtmlForMarkdownHref(href: string | undefined, label: string): string | null {
  const path = mediaPathFromMarkdownHref(href)
  if (!path) return null

  const kind = mediaKind(path)
  const name = mediaName(path)
  const text = escapeHtml(label || `${titleCaseKind(kind)}: ${name}`)
  const source = browserMediaSource(path)
  const fallbackHref = escapeHtml(mediaFallbackHref(path))

  if (kind === 'image') {
    if (source) {
      const escapedSource = escapeHtml(source)
      return `<a class="block max-w-full" href="${escapedSource}" target="_blank" rel="noreferrer" data-media-kind="image"><img class="block max-h-96 w-auto max-w-full rounded-control border border-line bg-black/20 object-contain" src="${escapedSource}" alt="${text}" loading="lazy"></a>`
    }

    if (isRemoteGatewayMediaPath(path)) {
      return `<span class="block max-w-full" data-media-kind="image"><img class="block max-h-96 w-auto max-w-full rounded-control border border-line bg-black/20 object-contain" src="${REMOTE_IMAGE_PLACEHOLDER}" data-gateway-media-src="${escapeHtml(path)}" alt="${text}" loading="lazy"></span>`
    }
  }

  if (kind === 'audio' && source) {
    return `<figure class="grid gap-1 rounded-control border border-line bg-surface/70 p-2" data-media-kind="audio"><figcaption class="text-xs text-ink-muted">${text}</figcaption><audio controls preload="metadata" src="${escapeHtml(source)}" class="w-full"></audio></figure>`
  }

  if (kind === 'video' && source) {
    return `<figure class="grid gap-1 rounded-control border border-line bg-black/30 p-2" data-media-kind="video"><video controls preload="metadata" src="${escapeHtml(source)}" class="max-h-96 w-full bg-black" playsinline></video><figcaption class="text-xs text-ink-muted">${text}</figcaption></figure>`
  }

  return `<a href="${fallbackHref}" target="_blank" rel="noreferrer" data-media-kind="file" class="inline-flex max-w-full items-center gap-2 rounded-control border border-line bg-surface/70 px-2 py-1 text-xs text-ink-bright hover:border-primary/55 hover:bg-primary/10"><span class="font-hud uppercase tracking-[0.16em] text-primary">${escapeHtml(titleCaseKind(kind))}</span><span class="truncate">${text}</span></a>`
}

function markdownPreviewLinkForFileRef(rawPath: string): string | null {
  const { path, trailing } = splitFileRef(rawPath)
  if (!path) return null

  const label = escapeMarkdownLabel(mediaName(path))
  const href = `#preview:${encodeURIComponent(filePathFromMediaPath(path))}`

  return `[${label}](${href})${trailing}`
}

const MEDIA_LINE_RE = /(^|\n)[\t ]*[`"']?MEDIA:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\n]+)[`"']?[\t ]*(\n|$)/g
const MEDIA_TAG_RE = /[`"']?MEDIA:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)[`"']?/g
const IMAGE_REF_RE = /@image:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g
const FILE_REF_RE = /@(?:file|local):(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g

export function isAgentBoxPath(path: string): boolean {
  const filePath = filePathFromMediaPath(path.trim())
  return filePath === '/box' || filePath.startsWith('/box/')
}

export function renderPreviewMediaReferences(text: string): string {
  return text
    .replace(MEDIA_LINE_RE, (_match, lead: string, rawPath: string, trailer: string) => {
      const link = markdownMediaLinkForRef(rawPath)
      return link ? `${lead}${link}${trailer}` : _match
    })
    .replace(MEDIA_TAG_RE, (_match, rawPath: string) => markdownMediaLinkForRef(rawPath) ?? _match)
    .replace(IMAGE_REF_RE, (_match, rawPath: string) => markdownMediaLinkForRef(rawPath) ?? _match)
    .replace(FILE_REF_RE, (_match, rawPath: string) => {
      return markdownPreviewLinkForFileRef(rawPath) ?? _match
    })
}

export async function gatewayMediaDataUrl(path: string, profile?: null | string): Promise<string> {
  const file = filePathFromMediaPath(path)
  const result = await dashboardRequest<GatewayMediaResponse>({
    path: `/api/media?path=${encodeURIComponent(file)}`,
    profile
  })

  return result.data_url
}
