import { hermesRemoteFilesAdapter } from '../adapters/hermes-remote-files-adapter'
import { filePathFromRemoteSource } from '../domain/preview'
import type { RemoteFileDefaultCwd, RemoteFileTextResponse } from '../domain/types'
import type { RemoteFilesPort, RemoteFilesProfile } from '../ports/remote-files-port'

export async function resolveRemoteFileText(
  path: string,
  port: RemoteFilesPort = hermesRemoteFilesAdapter,
  profile?: RemoteFilesProfile
): Promise<RemoteFileTextResponse> {
  return port.readText(filePathFromRemoteSource(path), profile)
}

export function readRemoteFileText(path: string, profile?: null | string): Promise<RemoteFileTextResponse> {
  return resolveRemoteFileText(path, hermesRemoteFilesAdapter, profile)
}

export async function resolveRemoteFileDataUrl(
  path: string,
  port: RemoteFilesPort = hermesRemoteFilesAdapter,
  profile?: RemoteFilesProfile
): Promise<string> {
  const result = await port.readDataUrl(filePathFromRemoteSource(path), profile)
  const dataUrl = result.dataUrl ?? result.data_url

  if (typeof dataUrl !== 'string' || !dataUrl) {
    throw new Error('Remote file API did not return a data URL')
  }

  return dataUrl
}

export function readRemoteFileDataUrl(path: string, profile?: null | string): Promise<string> {
  return resolveRemoteFileDataUrl(path, hermesRemoteFilesAdapter, profile)
}

export function getRemoteDefaultCwd(profile?: null | string): Promise<RemoteFileDefaultCwd> {
  return hermesRemoteFilesAdapter.defaultCwd(profile)
}
