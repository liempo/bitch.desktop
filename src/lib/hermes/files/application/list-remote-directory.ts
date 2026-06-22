import { hermesRemoteFilesAdapter } from '../adapters/hermes-remote-files-adapter'
import { filePathFromRemoteSource } from '../domain/preview'
import type { RawRemoteFileEntry, RawRemoteFileListing, RemoteFileEntry, RemoteFileListing } from '../domain/types'
import type { RemoteFilesPort, RemoteFilesProfile } from '../ports/remote-files-port'

function rawEntries(value: unknown): RawRemoteFileEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is RawRemoteFileEntry => Boolean(entry && typeof entry === 'object'))
}

function entrySortKey(entry: RemoteFileEntry): string {
  return `${entry.kind === 'directory' ? '0' : '1'}:${entry.name.toLocaleLowerCase()}`
}

export function normalizeRemoteFileListing(raw: RawRemoteFileListing, requestedPath: string): RemoteFileListing {
  const entries = rawEntries(raw.entries)
    .map(entry => {
      const name = typeof entry.name === 'string' ? entry.name : ''
      const path = typeof entry.path === 'string' ? entry.path : ''
      if (!name || !path) return null

      const normalized: RemoteFileEntry = {
        kind: entry.isDirectory === true ? 'directory' : 'file',
        name,
        path
      }

      if (typeof entry.size === 'number') normalized.size = entry.size
      return normalized
    })
    .filter((entry): entry is RemoteFileEntry => entry !== null)
    .sort((left, right) => entrySortKey(left).localeCompare(entrySortKey(right)))

  return {
    entries,
    ...(typeof raw.error === 'string' && raw.error ? { error: raw.error } : {}),
    path: requestedPath
  }
}

export async function listRemoteDirectory(
  path: string,
  port: RemoteFilesPort = hermesRemoteFilesAdapter,
  profile?: RemoteFilesProfile
): Promise<RemoteFileListing> {
  const remotePath = filePathFromRemoteSource(path)
  const raw = await port.list(remotePath, profile)
  return normalizeRemoteFileListing(raw, remotePath)
}

export function fetchRemoteFileListing(path: string, profile?: RemoteFilesProfile): Promise<RemoteFileListing> {
  return listRemoteDirectory(path, hermesRemoteFilesAdapter, profile)
}
