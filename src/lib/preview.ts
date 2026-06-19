import type { ThreadCanvas } from '$lib/canvas'
import {
  isDeniedRemoteFilePath,
  parseHermesFileRef,
  remoteFileLabel,
  viewerKindForRemoteFile,
  type RemoteFileViewerKind
} from '$lib/remote-files'

type ThreadPreviewKind = 'canvas' | 'file' | 'image' | 'tool-output' | 'url'

export interface ToolOutputPreviewInput {
  context?: string
  error?: string
  id?: string
  input?: string
  name: string
  output?: string
  status?: string
  summary?: string
}

export interface ThreadPreview {
  error?: string
  kind: ThreadPreviewKind
  label: string
  content?: string
  path?: string
  profile?: null | string
  source: string
  url: null | string
  viewerKind?: RemoteFileViewerKind
}

function previewKindForViewer(
  viewerKind: RemoteFileViewerKind
): Exclude<ThreadPreviewKind, 'canvas' | 'tool-output' | 'url'> {
  return viewerKind === 'image' ? 'image' : 'file'
}

function safeUrlLabelPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

function labelForUrl(url: URL): string {
  const path = safeUrlLabelPath(url.pathname).replace(/\/$/, '')
  return `${url.host}${path === '/' ? '' : path}`
}

function normalizedPreviewUrl(source: string): string | null {
  const trimmed = source.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function appendToolSection(sections: string[], label: string, value: string | undefined): void {
  const text = value?.trim()
  if (!text) return
  sections.push(`${label}\n${text}`)
}

export function previewFromUrl(source: string, profile?: null | string): ThreadPreview | null {
  const normalizedUrl = normalizedPreviewUrl(source)
  if (!normalizedUrl) return null

  const url = new URL(normalizedUrl)
  return {
    kind: 'url',
    label: labelForUrl(url),
    ...(profile ? { profile } : {}),
    source: normalizedUrl,
    url: normalizedUrl,
    viewerKind: 'html'
  }
}

export function previewFromToolOutput(tool: ToolOutputPreviewInput): ThreadPreview | null {
  const name = tool.name.trim() || 'tool'
  const sections: string[] = []

  appendToolSection(sections, 'Summary', tool.summary)
  appendToolSection(sections, 'Context', tool.context)
  appendToolSection(sections, 'Input', tool.input)
  appendToolSection(sections, 'Output', tool.output)
  appendToolSection(sections, 'Error', tool.error)

  const content = sections.join('\n\n').trim()
  if (!content) return null

  return {
    content,
    kind: 'tool-output',
    label: `${name} output`,
    source: `tool-output:${tool.id?.trim() || name}`,
    url: null,
    viewerKind: 'text'
  }
}

export function previewFromRemoteFilePath(path: string, source = path, profile?: null | string): ThreadPreview | null {
  const remotePath = path.trim()
  if (!remotePath) return null

  const viewerKind = viewerKindForRemoteFile(remotePath)
  const preview: ThreadPreview = {
    kind: previewKindForViewer(viewerKind),
    label: remoteFileLabel(remotePath),
    path: remotePath,
    ...(profile ? { profile } : {}),
    source,
    url: null,
    viewerKind
  }

  if (isDeniedRemoteFilePath(remotePath)) {
    preview.error =
      'Automatic preview blocked for a secret-like path. Open it explicitly from the remote shell if you really need it.'
  }

  return preview
}

export function previewFromFileRef(rawSource: string, profile?: null | string): ThreadPreview | null {
  const ref = parseHermesFileRef(rawSource)
  if (!ref) return null
  return previewFromRemoteFilePath(ref.path, rawSource.trim(), profile)
}

export function previewFromCanvas(canvas: ThreadCanvas): ThreadPreview {
  const preview: ThreadPreview = {
    error: canvas.error,
    kind: 'canvas',
    label: canvas.label,
    source: canvas.source,
    url: canvas.url,
    viewerKind: canvas.path ? 'html' : undefined
  }

  if (canvas.path) preview.path = canvas.path

  return preview
}
