import type {
  RawRemoteFileDataUrlResponse,
  RawRemoteFileListing,
  RemoteFileDefaultCwd,
  RemoteFileTextResponse
} from '../domain/types'

export type RemoteFilesProfile = null | string | { profile?: null | string }

export interface RemoteFilesPort {
  defaultCwd(profile?: RemoteFilesProfile): Promise<RemoteFileDefaultCwd>
  list(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileListing>
  readDataUrl(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileDataUrlResponse>
  readText(path: string, profile?: RemoteFilesProfile): Promise<RemoteFileTextResponse>
}

function profileFromOptions(profile?: RemoteFilesProfile): null | string | undefined {
  return typeof profile === 'object' && profile !== null ? profile.profile : profile
}

export function normalizedProfile(profile?: RemoteFilesProfile): string | undefined {
  return profileFromOptions(profile)?.trim() || undefined
}
