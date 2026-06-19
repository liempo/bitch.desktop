import {
  filePathFromRemoteSource,
  parseHermesFileRef,
  remoteFileHref,
  remoteFileLabel,
  viewerKindForRemoteFile
} from '$lib/remote-files'

const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const AUDIO_EXTENSIONS = new Set(['.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav'])
const VIDEO_EXTENSIONS = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm'])

const MEDIA_REF_RE = /[`"']?MEDIA:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\s`"'<>)]+)/g
const IMAGE_REF_RE = /@image:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\s`"'<>)]+)/g
const FILE_REF_RE = /@file:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\s`"'<>)]+)/gi

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;!?]+$/, '').trim()
}

function unquoteMediaRef(value: string): string {
  const trimmed = value.trim()
  const head = trimmed[0]
  const tail = trimmed[trimmed.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  return stripTrailingPunctuation(quoted ? trimmed.slice(1, -1) : trimmed)
}

export function filePathFromMediaPath(path: string): string {
  return filePathFromRemoteSource(path)
}

export function mediaExtension(path: string): string {
  const file = filePathFromMediaPath(path).split(/[?#]/, 1)[0] ?? ''
  const name = file.split(/[\\/]/).pop() ?? file
  const dot = name.lastIndexOf('.')

  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function mediaName(path: string): string {
  return remoteFileLabel(path)
}

export function isRemoteGatewayMediaPath(path: string): boolean {
  const value = path.trim()
  if (!value || /^(?:https?|data|blob):/i.test(value)) return false
  const extension = mediaExtension(value)
  return IMAGE_EXTENSIONS.has(extension) || AUDIO_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)
}

function escapedMarkdownLabel(path: string): string {
  return mediaName(path).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function markdownForMediaPath(path: string): string {
  const label = escapedMarkdownLabel(path)
  const viewerKind = viewerKindForRemoteFile(path)

  if (viewerKind === 'image') return `![Image: ${label}](${remoteFileHref(path, 'media')})`
  if (viewerKind === 'audio') return `[Audio: ${label}](${remoteFileHref(path, 'media')})`
  if (viewerKind === 'video') return `[Video: ${label}](${remoteFileHref(path, 'media')})`

  return `[File: ${label}](${remoteFileHref(path, 'preview')})`
}

function markdownForFileRef(refText: string): string {
  const ref = parseHermesFileRef(refText)
  if (!ref) return refText

  return `[File: ${escapedMarkdownLabel(ref.path)}](${remoteFileHref(ref.path, 'preview')})`
}

export function renderPreviewMediaReferences(text: string): string {
  return text
    .replace(MEDIA_REF_RE, (_match, rawPath: string) => markdownForMediaPath(unquoteMediaRef(rawPath)))
    .replace(IMAGE_REF_RE, (_match, rawPath: string) => {
      const path = unquoteMediaRef(rawPath)
      const extension = mediaExtension(path)
      if (!IMAGE_EXTENSIONS.has(extension)) return _match
      return markdownForMediaPath(path)
    })
    .replace(FILE_REF_RE, (match: string) => markdownForFileRef(match))
}
