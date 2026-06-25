import type { IconName } from '$lib/theme'

export type RemoteFileHrefMode = 'media' | 'preview'
export type RemoteFileEntryKind = 'directory' | 'file'
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
  mimeType?: null | string
  modifiedAt?: number
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

export interface RawManagedRemoteFileEntry {
  is_directory?: unknown
  isDirectory?: unknown
  mime_type?: unknown
  mimeType?: unknown
  modifiedAt?: unknown
  mtime?: unknown
  name?: unknown
  path?: unknown
  size?: unknown
}

export interface RawRemoteFileActionMetadata {
  can_change_path?: unknown
  canChangePath?: unknown
  locked_root?: unknown
  lockedRoot?: unknown
  parent?: unknown
  root?: unknown
}

export interface RawRemoteFileActionResponse extends RawRemoteFileActionMetadata {
  entry?: unknown
  ok?: unknown
  path?: unknown
}

export interface RemoteFileActionResponse {
  canChangePath?: boolean
  entry?: RemoteFileEntry
  lockedRoot?: null | string
  ok: boolean
  parent?: null | string
  path: string
  root?: null | string
}

export interface RawRemoteFileDeleteResponse extends RawRemoteFileActionMetadata {
  ok?: unknown
  path?: unknown
}

export interface RemoteFileDeleteResponse {
  canChangePath?: boolean
  lockedRoot?: null | string
  ok: boolean
  parent?: null | string
  path: string
  root?: null | string
}

export interface RawRemoteManagedFileDataUrlResponse extends RawRemoteFileActionMetadata {
  data_url?: unknown
  dataUrl?: unknown
  mime_type?: unknown
  mimeType?: unknown
  name?: unknown
  path?: unknown
  size?: unknown
}

export interface RemoteManagedFileDataUrlResponse {
  canChangePath?: boolean
  dataUrl: string
  lockedRoot?: null | string
  mimeType: string
  name: string
  path: string
  root?: null | string
  size: number
}

export type RemoteFileAction =
  | 'create-directory'
  | 'delete-path'
  | 'read-managed-data-url'
  | 'upload-file'
  | 'write-data-url'

type FileAccent = 'archive' | 'audio' | 'code' | 'file' | 'html' | 'image' | 'pdf' | 'text' | 'video'

export interface FilePresentation {
  accent: FileAccent
  extension: string
  icon: IconName
  title: string
  viewerKind: RemoteFileViewerKind
}
