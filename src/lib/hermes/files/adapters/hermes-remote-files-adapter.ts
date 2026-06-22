import { dashboardRequest } from '$lib/hermes/shared/adapters/dashboard-api-client'
import { filePathFromRemoteSource } from '../domain/preview'
import type {
  RawRemoteFileDataUrlResponse,
  RawRemoteFileListing,
  RemoteFileDefaultCwd,
  RemoteFileTextResponse
} from '../domain/types'
import { normalizedProfile, type RemoteFilesPort, type RemoteFilesProfile } from '../ports/remote-files-port'

function requestOptions(path: string, profile?: RemoteFilesProfile): { path: string; profile?: string } {
  const activeProfile = normalizedProfile(profile)
  return activeProfile ? { path, profile: activeProfile } : { path }
}

export function createHermesRemoteFilesAdapter(): RemoteFilesPort {
  return {
    defaultCwd(profile?: RemoteFilesProfile): Promise<RemoteFileDefaultCwd> {
      return dashboardRequest<RemoteFileDefaultCwd>(requestOptions('/api/fs/default-cwd', profile))
    },

    list(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileListing> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RawRemoteFileListing>(
        requestOptions(`/api/fs/list?path=${encodeURIComponent(remotePath)}`, profile)
      )
    },

    readDataUrl(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileDataUrlResponse> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RawRemoteFileDataUrlResponse>(
        requestOptions(`/api/fs/read-data-url?path=${encodeURIComponent(remotePath)}`, profile)
      )
    },

    readText(path: string, profile?: RemoteFilesProfile): Promise<RemoteFileTextResponse> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RemoteFileTextResponse>(
        requestOptions(`/api/fs/read-text?path=${encodeURIComponent(remotePath)}`, profile)
      )
    }
  }
}

export const hermesRemoteFilesAdapter = createHermesRemoteFilesAdapter()
