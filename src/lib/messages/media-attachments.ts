import { mediaExtension } from '$lib/media'
import { extractEmbeddedImages } from '$lib/messages/chat-runtime'

export type ThreadAttachmentKind = 'image' | 'pdf'

export interface ThreadAttachment {
  dataUrl?: string
  detail?: string
  id: string
  kind: ThreadAttachmentKind
  label: string
  mediaType?: string
  path?: string
  previewUrl?: string
  size?: number
  url?: string
}

export interface ThreadAttachmentInput {
  dataUrl?: string
  detail?: string
  id?: string
  kind: ThreadAttachmentKind
  label: string
  mediaType?: string
  path?: string
  previewUrl?: string
  size?: number
  url?: string
}

export type AttachmentIdFactory = (prefix: string) => string

const IMAGE_ATTACHMENT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'])
const IMAGE_DIRECTIVE_RE = /@image:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g

function unquoteRefValue(raw: string): string {
  const trimmed = raw.trim()
  const head = trimmed[0]
  const tail = trimmed[trimmed.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  return (quoted ? trimmed.slice(1, -1) : trimmed).replace(/[,.;!?]+$/, '').trim()
}

export function mediaLabelFromSource(source: string, kind: ThreadAttachmentKind = 'image'): string {
  if (source.startsWith('data:')) return kind === 'pdf' ? 'document.pdf' : 'image'

  try {
    const url = new URL(source)
    return url.pathname.split('/').filter(Boolean).pop() || source
  } catch {
    return source.split(/[\\/]/).filter(Boolean).pop() || source
  }
}

export function mimeTypeFromDataUrl(source: string): string | undefined {
  return source.match(/^data:([^;,]+)[;,]/i)?.[1]
}

export function attachmentKindFromMediaSource(source: string): ThreadAttachmentKind | null {
  if (/^data:image\//i.test(source)) return 'image'
  if (/^data:application\/pdf[;,]/i.test(source)) return 'pdf'

  const extension = mediaExtension(source)

  if (IMAGE_ATTACHMENT_EXTENSIONS.has(extension)) return 'image'
  if (extension === '.pdf') return 'pdf'

  return null
}

export function attachmentFromMediaSource(
  source: string,
  prefix: string,
  createAttachmentId: AttachmentIdFactory
): ThreadAttachment | null {
  const value = source.trim()
  if (!value) return null

  const kind = attachmentKindFromMediaSource(value)
  if (!kind) return null

  const attachment: ThreadAttachment = {
    id: createAttachmentId(prefix),
    kind,
    label: mediaLabelFromSource(value, kind)
  }

  if (/^data:/i.test(value)) {
    attachment.dataUrl = value
    attachment.mediaType = mimeTypeFromDataUrl(value)
  } else if (/^https?:/i.test(value)) {
    attachment.url = value
  } else {
    attachment.path = value
  }

  return attachment
}

export function cloneThreadAttachment(
  attachment: ThreadAttachmentInput,
  createAttachmentId: AttachmentIdFactory
): ThreadAttachment {
  return {
    dataUrl: attachment.dataUrl,
    detail: attachment.detail,
    id: attachment.id || createAttachmentId(attachment.kind),
    kind: attachment.kind,
    label: attachment.label,
    mediaType: attachment.mediaType,
    path: attachment.path,
    previewUrl: attachment.previewUrl,
    size: attachment.size,
    url: attachment.url
  }
}

export function attachmentDisplayLabel(attachment: ThreadAttachmentInput): string {
  const detail = attachment.detail?.trim()
  if (detail) return `${attachment.label} (${detail})`
  if (typeof attachment.size === 'number') return `${attachment.label} (${formatBytes(attachment.size)})`
  return attachment.label
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function imageSourcesFromContent(value: unknown): string[] {
  if (typeof value === 'string') {
    return extractEmbeddedImages(value).images
  }

  if (Array.isArray(value)) {
    return value.flatMap(imageSourcesFromContent)
  }

  if (!value || typeof value !== 'object') return []

  const row = value as Record<string, unknown>
  const sources: string[] = []

  if (row.type === 'image_url') {
    const imageUrl = row.image_url
    if (typeof imageUrl === 'string') {
      sources.push(imageUrl)
    } else if (
      imageUrl &&
      typeof imageUrl === 'object' &&
      typeof (imageUrl as Record<string, unknown>).url === 'string'
    ) {
      sources.push((imageUrl as Record<string, string>).url)
    }
  }

  for (const key of ['content', 'text', 'message']) {
    if (key in row) {
      sources.push(...imageSourcesFromContent(row[key]))
    }
  }

  return sources
}

export function extractImageDirectiveSources(text: string): { cleanedText: string; sources: string[] } {
  const sources: string[] = []
  const cleanedText = text
    .replace(IMAGE_DIRECTIVE_RE, (_match, rawSource: string) => {
      const source = unquoteRefValue(rawSource)
      if (source) sources.push(source)
      return ''
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanedText, sources }
}

export function extractMediaDirectiveSources(text: string): { cleanedText: string; sources: string[] } {
  return { cleanedText: text, sources: [] }
}
