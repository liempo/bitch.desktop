import { dashboardRequest, type DashboardRequestOptions } from '$lib/hermes/shared/adapters/dashboard-api-client'
import { filePathFromRemoteSource } from '../domain/preview'
import type {
  RawRemoteFileActionResponse,
  RawRemoteFileDataUrlResponse,
  RawRemoteFileDeleteResponse,
  RawRemoteFileListing,
  RawRemoteManagedFileDataUrlResponse,
  RemoteFileDefaultCwd,
  RemoteFileTextResponse
} from '../domain/types'
import {
  normalizedProfile,
  type RemoteFileUploadInput,
  type RemoteFilesPort,
  type RemoteFilesProfile,
  type RemoteFileWriteDataUrlInput
} from '../ports/remote-files-port'

function requestOptions(
  path: string,
  profile?: RemoteFilesProfile,
  options: Omit<DashboardRequestOptions, 'path' | 'profile'> = {}
): DashboardRequestOptions {
  const activeProfile = normalizedProfile(profile)
  return activeProfile ? { ...options, path, profile: activeProfile } : { ...options, path }
}

function uploadFileName(input: RemoteFileUploadInput): string {
  if (input.fileName?.trim()) return input.fileName.trim()

  const namedFile = input.file as Blob & { name?: unknown }
  return typeof namedFile.name === 'string' && namedFile.name.trim() ? namedFile.name.trim() : 'upload'
}

function createUploadFormData(input: RemoteFileUploadInput): FormData {
  const form = new FormData()
  form.append('path', filePathFromRemoteSource(input.path))
  form.append('overwrite', String(input.overwrite ?? true))
  form.append('file', input.file, uploadFileName(input))
  return form
}

export function createHermesRemoteFilesAdapter(): RemoteFilesPort {
  return {
    createDirectory(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteFileActionResponse> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RawRemoteFileActionResponse>(
        requestOptions('/api/files/mkdir', profile, {
          body: { path: remotePath },
          method: 'POST'
        })
      )
    },

    defaultCwd(profile?: RemoteFilesProfile): Promise<RemoteFileDefaultCwd> {
      return dashboardRequest<RemoteFileDefaultCwd>(requestOptions('/api/fs/default-cwd', profile))
    },

    deletePath(path: string, recursive = false, profile?: RemoteFilesProfile): Promise<RawRemoteFileDeleteResponse> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RawRemoteFileDeleteResponse>(
        requestOptions('/api/files', profile, {
          body: { path: remotePath, recursive },
          method: 'DELETE'
        })
      )
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

    readManagedDataUrl(path: string, profile?: RemoteFilesProfile): Promise<RawRemoteManagedFileDataUrlResponse> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RawRemoteManagedFileDataUrlResponse>(
        requestOptions(`/api/files/read?path=${encodeURIComponent(remotePath)}`, profile)
      )
    },

    readText(path: string, profile?: RemoteFilesProfile): Promise<RemoteFileTextResponse> {
      const remotePath = filePathFromRemoteSource(path)
      return dashboardRequest<RemoteFileTextResponse>(
        requestOptions(`/api/fs/read-text?path=${encodeURIComponent(remotePath)}`, profile)
      )
    },

    uploadFile(input: RemoteFileUploadInput, profile?: RemoteFilesProfile): Promise<RawRemoteFileActionResponse> {
      return dashboardRequest<RawRemoteFileActionResponse>(
        requestOptions('/api/files/upload-stream', profile, {
          body: createUploadFormData(input),
          method: 'POST'
        })
      )
    },

    writeDataUrl(
      input: RemoteFileWriteDataUrlInput,
      profile?: RemoteFilesProfile
    ): Promise<RawRemoteFileActionResponse> {
      const remotePath = filePathFromRemoteSource(input.path)
      return dashboardRequest<RawRemoteFileActionResponse>(
        requestOptions('/api/files/upload', profile, {
          body: { data_url: input.dataUrl, overwrite: input.overwrite ?? true, path: remotePath },
          method: 'POST'
        })
      )
    }
  }
}

export const hermesRemoteFilesAdapter = createHermesRemoteFilesAdapter()
