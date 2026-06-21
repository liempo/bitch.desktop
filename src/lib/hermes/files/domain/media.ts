import {
  filePathFromRemoteSource,
  parseHermesFileRef,
  remoteFileExtension,
  remoteFileHref,
  remoteFileLabel,
  viewerKindForRemoteFile
} from './preview'

const MEDIA_REF_RE = /[`"']?@?media:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\s`"'<>)]+)/gi
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
  return remoteFileExtension(filePathFromMediaPath(path))
}

export function mediaName(path: string): string {
  return remoteFileLabel(path)
}

export function isRemoteGatewayMediaPath(path: string): boolean {
  const value = path.trim()
  if (!value || /^(?:https?|data|blob):/i.test(value)) return false
  const viewerKind = viewerKindForRemoteFile(value)
  return viewerKind === 'image' || viewerKind === 'audio' || viewerKind === 'video'
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
  if (viewerKind === 'pdf') return `[PDF: ${label}](${remoteFileHref(path, 'media')})`

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
      if (viewerKindForRemoteFile(path) !== 'image') return _match
      return markdownForMediaPath(path)
    })
    .replace(FILE_REF_RE, (match: string) => markdownForFileRef(match))
}
