import { dashboardRequest } from '$lib/api/dashboard'
import { boxUrlForAgentPath } from '$lib/box'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'])

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

function unquoteMediaRef(value: string): string {
  const trimmed = value.trim()
  const head = trimmed[0]
  const tail = trimmed[trimmed.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  return (quoted ? trimmed.slice(1, -1) : trimmed).replace(/[,.;!?]+$/, '').trim()
}

export function mediaName(path: string): string {
  const file = filePathFromMediaPath(path).split(/[?#]/, 1)[0] ?? ''
  return file.split(/[\\/]/).filter(Boolean).pop() || path
}

export function isRemoteGatewayMediaPath(path: string): boolean {
  const value = path.trim()

  if (!value) return false
  if (/^(?:https?|data|blob):/i.test(value)) return false

  return IMAGE_EXTENSIONS.has(mediaExtension(value))
}

function isPreviewableImageSource(path: string): boolean {
  const value = path.trim()

  if (!value) return false
  if (/^data:image\//i.test(value)) return true
  if (/^https?:/i.test(value)) return IMAGE_EXTENSIONS.has(mediaExtension(value))

  return isRemoteGatewayMediaPath(value)
}

function encodedAgentBoxHref(path: string): string {
  return encodeURI(filePathFromMediaPath(path.trim()))
}

function markdownUrlForMedia(path: string): string {
  return isAgentBoxPath(path) ? encodedAgentBoxHref(path) : (boxUrlForAgentPath(path) ?? path)
}

function markdownImageForMedia(path: string): string {
  const label = mediaName(path).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')

  return `![Image: ${label}](${markdownUrlForMedia(path)})`
}

function markdownAttachmentForMedia(path: string): string {
  const label = mediaName(path).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')

  return `[Attachment: ${label}](${markdownUrlForMedia(path)})`
}

const MEDIA_LINE_RE = /(^|\n)[\t ]*[`"']?MEDIA:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\n]+)[`"']?[\t ]*(\n|$)/g
const MEDIA_TAG_RE = /[`"']?MEDIA:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)[`"']?/g
const IMAGE_REF_RE = /@image:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g
const BOX_PATH_LINE_RE = /(^|\n)[\t ]*[`"']?(file:\/\/\/box\/[^`"'\n]+|\/box\/[^`"'\n]+)[`"']?[\t ]*(\n|$)/g

export function isAgentBoxPath(path: string): boolean {
  const filePath = filePathFromMediaPath(path.trim())
  return filePath === '/box' || filePath.startsWith('/box/')
}

export function renderPreviewMediaReferences(text: string): string {
  return text
    .replace(MEDIA_LINE_RE, (_match, lead: string, rawPath: string, trailer: string) => {
      const path = unquoteMediaRef(rawPath)
      if (isAgentBoxPath(path)) return `${lead}${markdownAttachmentForMedia(path)}${trailer}`
      if (isPreviewableImageSource(path)) return `${lead}${markdownImageForMedia(path)}${trailer}`
      if (boxUrlForAgentPath(path)) return `${lead}${markdownAttachmentForMedia(path)}${trailer}`
      return _match
    })
    .replace(MEDIA_TAG_RE, (_match, rawPath: string) => {
      const path = unquoteMediaRef(rawPath)
      if (isAgentBoxPath(path)) return markdownAttachmentForMedia(path)
      if (isPreviewableImageSource(path)) return markdownImageForMedia(path)
      if (boxUrlForAgentPath(path)) return markdownAttachmentForMedia(path)
      return _match
    })
    .replace(IMAGE_REF_RE, (_match, rawPath: string) => {
      const path = unquoteMediaRef(rawPath)
      if (isAgentBoxPath(path)) return markdownAttachmentForMedia(path)
      return isPreviewableImageSource(path) ? markdownImageForMedia(path) : _match
    })
    .replace(BOX_PATH_LINE_RE, (_match, lead: string, rawPath: string, trailer: string) => {
      const path = unquoteMediaRef(rawPath)
      return isAgentBoxPath(path) ? `${lead}${markdownAttachmentForMedia(path)}${trailer}` : _match
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
