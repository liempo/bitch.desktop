import { boxUrlForAgentPath } from '$lib/box'
import type { ThreadCanvas } from '$lib/canvas'
import { filePathFromMediaPath, mediaExtension, mediaName } from '$lib/media'

const IMAGE_PREVIEW_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'])

export type ThreadPreviewKind = 'canvas' | 'file' | 'image'

export interface ThreadPreview {
  error?: string
  kind: ThreadPreviewKind
  label: string
  path?: string
  source: string
  url: null | string
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function sourcePath(source: string): string {
  return filePathFromMediaPath(source.trim())
}

function labelFromSource(source: string): string {
  return safeDecodeURIComponent(mediaName(source))
}

function previewKindForPath(path: string): Exclude<ThreadPreviewKind, 'canvas'> {
  return IMAGE_PREVIEW_EXTENSIONS.has(mediaExtension(path)) ? 'image' : 'file'
}

export function previewKindForBoxPath(source: string): Exclude<ThreadPreviewKind, 'canvas'> | null {
  const path = sourcePath(source)

  if (path !== '/box' && !path.startsWith('/box/')) return null

  return previewKindForPath(path)
}

export function previewFromBoxPath(rawSource: string): ThreadPreview | null {
  const source = rawSource.trim()
  if (!source) return null

  const path = sourcePath(source)
  const kind = previewKindForBoxPath(source)
  if (!kind) return null

  const url = boxUrlForAgentPath(source)
  const preview: ThreadPreview = {
    kind,
    label: labelFromSource(source),
    path,
    source,
    url
  }

  if (!url) {
    preview.error = 'VITE_BOX_BASE_URL is not configured. Declare it in .env to preview this BOX file.'
  }

  return preview
}

export function previewFromFileReference(rawSource: string): ThreadPreview | null {
  const source = rawSource.trim()
  if (!source) return null

  const path = sourcePath(source)
  if (path === '/box' || path.startsWith('/box/')) return previewFromBoxPath(source)

  return {
    error: 'Local file references are not browser-fetchable yet.',
    kind: previewKindForPath(path),
    label: labelFromSource(source),
    path,
    source,
    url: null
  }
}

export function previewFromCanvas(canvas: ThreadCanvas): ThreadPreview {
  const preview: ThreadPreview = {
    error: canvas.error,
    kind: 'canvas',
    label: canvas.label,
    source: canvas.source,
    url: canvas.url
  }

  if (canvas.path) preview.path = canvas.path

  return preview
}
