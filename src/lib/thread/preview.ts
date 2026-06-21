import type { ThreadCanvas } from '$lib/thread/canvas'
import {
  isDeniedRemoteFilePath,
  parseHermesFileRef,
  remoteFileLabel,
  viewerKindForRemoteFile,
  type RemoteFileViewerKind
} from '$lib/hermes/files'

type ThreadPreviewKind = 'canvas' | 'file' | 'image'

export interface ThreadPreview {
  error?: string
  kind: ThreadPreviewKind
  label: string
  path?: string
  profile?: null | string
  source: string
  url: null | string
  viewerKind?: RemoteFileViewerKind
}

function previewKindForViewer(viewerKind: RemoteFileViewerKind): Exclude<ThreadPreviewKind, 'canvas'> {
  return viewerKind === 'image' ? 'image' : 'file'
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
