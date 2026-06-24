import type {
  RawRemoteFileActionResponse,
  RawRemoteFileDataUrlResponse,
  RawRemoteFileDeleteResponse,
  RawRemoteFileListing,
  RawRemoteManagedFileDataUrlResponse,
  RemoteFileDefaultCwd,
  RemoteFileTextResponse
} from '../domain/types'

export type RemoteFilesProfile = null | string | { profile?: null | string }

export interface RemoteFileUploadInput {
  file: Blob
  fileName?: string
  overwrite?: boolean
  path: string
}

export interface RemoteFileWriteDataUrlInput {
  dataUrl: string
  overwrite?: boolean
  path: string
}

export interface RemoteFilesPort {
  createDirectory(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileActionResponse>
  defaultCwd(profile?: RemoteFilesProfile): Promise<RemoteFileDefaultCwd>
  deletePath(path: string, recursive?: boolean, profile?: RemoteFilesProfile): Promise<RawRemoteFileDeleteResponse>
  list(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileListing>
  readDataUrl(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileDataUrlResponse>
  readManagedDataUrl(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteManagedFileDataUrlResponse>
  readText(path: string, profile?: RemoteFilesProfile): Promise<RemoteFileTextResponse>
  uploadFile(input: RemoteFileUploadInput, profile?: RemoteFilesProfile): Promise<RawRemoteFileActionResponse>
  writeDataUrl(input: RemoteFileWriteDataUrlInput, profile?: RemoteFilesProfile): Promise<RawRemoteFileActionResponse>
}

function profileFromOptions(profile?: RemoteFilesProfile): null | string | undefined {
  return typeof profile === 'object' && profile !== null ? profile.profile : profile
}

export function normalizedProfile(profile?: RemoteFilesProfile): string | undefined {
  return profileFromOptions(profile)?.trim() || undefined
}

export function isRemoteFilesPort(value: unknown): value is RemoteFilesPort {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createDirectory' in value &&
    'deletePath' in value &&
    'list' in value &&
    'readText' in value
  )
}
