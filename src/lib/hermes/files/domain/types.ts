import type { NerdIconName } from '$lib/theme'

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

export interface RemoteFileDefaultCwd {
  branch?: string
  cwd: string
}

export interface RawRemoteFileEntry {
  isDirectory?: unknown
  name?: unknown
  path?: unknown
  size?: unknown
}

export interface RawRemoteFileListing {
  entries?: unknown
  error?: unknown
}

export interface RawRemoteFileDataUrlResponse {
  data_url?: unknown
  dataUrl?: unknown
}

type FileAccent = 'archive' | 'audio' | 'code' | 'file' | 'html' | 'image' | 'pdf' | 'text' | 'video'

export interface FilePresentation {
  accent: FileAccent
  extension: string
  icon: NerdIconName
  title: string
  viewerKind: RemoteFileViewerKind
}
