import { hermesRemoteFilesAdapter } from '../adapters/hermes-remote-files-adapter'
import { filePathFromRemoteSource } from '../domain/preview'
import type {
  RawManagedRemoteFileEntry,
  RawRemoteFileActionMetadata,
  RawRemoteFileActionResponse,
  RawRemoteFileDeleteResponse,
  RawRemoteManagedFileDataUrlResponse,
  RemoteFileAction,
  RemoteFileActionResponse,
  RemoteFileDeleteResponse,
  RemoteFileEntry,
  RemoteManagedFileDataUrlResponse
} from '../domain/types'
import {
  isRemoteFilesPort,
  type RemoteFilesPort,
  type RemoteFilesProfile,
  type RemoteFileUploadInput,
  type RemoteFileWriteDataUrlInput
} from '../ports/remote-files-port'

export interface RemoteFileDeleteOptions {
  profile?: RemoteFilesProfile
  recursive?: boolean
}

export class RemoteFileActionError extends Error {
  readonly action: RemoteFileAction
  readonly cause?: unknown

  constructor(action: RemoteFileAction, message: string, cause?: unknown) {
    super(message)
    this.name = 'RemoteFileActionError'
    this.action = action
    this.cause = cause
  }
}

function remoteActionLabel(action: RemoteFileAction): string {
  switch (action) {
    case 'create-directory':
      return 'create remote directory'
    case 'delete-path':
      return 'delete remote path'
    case 'read-managed-data-url':
      return 'read remote file data URL'
    case 'upload-file':
      return 'upload remote file'
    case 'write-data-url':
      return 'write remote file'
  }
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function normalizeRemoteFileActionError(action: RemoteFileAction, error: unknown): RemoteFileActionError {
  if (isRemoteFileActionError(error)) return error
  return new RemoteFileActionError(
    action,
    `Could not ${remoteActionLabel(action)}: ${messageFromUnknown(error)}`,
    error
  )
}

export function isRemoteFileActionError(value: unknown): value is RemoteFileActionError {
  return (
    value instanceof RemoteFileActionError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { name?: unknown }).name === 'RemoteFileActionError' &&
      typeof (value as { action?: unknown }).action === 'string')
  )
}

async function withRemoteActionError<T>(action: RemoteFileAction, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw normalizeRemoteFileActionError(action, error)
  }
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function field(raw: Record<string, unknown>, snakeName: string, camelName: string = snakeName): unknown {
  return raw[camelName] ?? raw[snakeName]
}

function nullableString(value: unknown): null | string | undefined {
  if (typeof value === 'string') return value
  if (value === null) return null
  return undefined
}

function actionMetadata(
  raw: RawRemoteFileActionMetadata
): Pick<RemoteFileActionResponse, 'canChangePath' | 'lockedRoot' | 'parent' | 'root'> {
  const source = rawObject(raw)
  const canChangePath = field(source, 'can_change_path', 'canChangePath')
  const root = nullableString(source.root)
  const lockedRoot = nullableString(field(source, 'locked_root', 'lockedRoot'))
  const parent = nullableString(source.parent)

  return {
    ...(typeof canChangePath === 'boolean' ? { canChangePath } : {}),
    ...(lockedRoot !== undefined ? { lockedRoot } : {}),
    ...(parent !== undefined ? { parent } : {}),
    ...(root !== undefined ? { root } : {})
  }
}

export function normalizeManagedRemoteFileEntry(raw: unknown): RemoteFileEntry | null {
  const entry = rawObject(raw) as RawManagedRemoteFileEntry
  const name = typeof entry.name === 'string' ? entry.name : ''
  const path = typeof entry.path === 'string' ? entry.path : ''
  if (!name || !path) return null

  const size = typeof entry.size === 'number' ? entry.size : undefined
  const modifiedAt =
    typeof entry.mtime === 'number' ? entry.mtime : typeof entry.modifiedAt === 'number' ? entry.modifiedAt : undefined
  const mimeType = nullableString(field(rawObject(entry), 'mime_type', 'mimeType'))
  const isDirectory = entry.is_directory === true || entry.isDirectory === true

  return {
    kind: isDirectory ? 'directory' : 'file',
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(modifiedAt !== undefined ? { modifiedAt } : {}),
    name,
    path,
    ...(size !== undefined ? { size } : {})
  }
}

export function normalizeRemoteFileActionResponse(
  raw: RawRemoteFileActionResponse,
  requestedPath: string
): RemoteFileActionResponse {
  const source = rawObject(raw) as RawRemoteFileActionResponse
  const entry = normalizeManagedRemoteFileEntry(source.entry)
  const path = typeof source.path === 'string' && source.path ? source.path : requestedPath

  return {
    ...actionMetadata(source),
    ...(entry ? { entry } : {}),
    ok: source.ok === false ? false : true,
    path
  }
}

export function normalizeRemoteFileDeleteResponse(
  raw: RawRemoteFileDeleteResponse,
  requestedPath: string
): RemoteFileDeleteResponse {
  const source = rawObject(raw) as RawRemoteFileDeleteResponse
  const path = typeof source.path === 'string' && source.path ? source.path : requestedPath

  return {
    ...actionMetadata(source),
    ok: source.ok === false ? false : true,
    path
  }
}

function fallbackName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path || 'download'
}

export function normalizeRemoteManagedFileDataUrlResponse(
  raw: RawRemoteManagedFileDataUrlResponse,
  requestedPath: string
): RemoteManagedFileDataUrlResponse {
  const source = rawObject(raw) as RawRemoteManagedFileDataUrlResponse
  const dataUrl = source.dataUrl ?? source.data_url
  if (typeof dataUrl !== 'string' || !dataUrl) {
    throw new Error('Remote managed file API did not return a data URL')
  }

  const path = typeof source.path === 'string' && source.path ? source.path : requestedPath
  const mimeType =
    typeof source.mimeType === 'string'
      ? source.mimeType
      : typeof source.mime_type === 'string'
        ? source.mime_type
        : 'application/octet-stream'
  const name = typeof source.name === 'string' && source.name ? source.name : fallbackName(path)
  const size = typeof source.size === 'number' ? source.size : 0

  return {
    ...actionMetadata(source),
    dataUrl,
    mimeType,
    name,
    path,
    size
  }
}

function portAndProfile(
  portOrProfile?: RemoteFilesPort | RemoteFilesProfile,
  profile?: RemoteFilesProfile
): { port: RemoteFilesPort; profile?: RemoteFilesProfile } {
  if (isRemoteFilesPort(portOrProfile)) return { port: portOrProfile, profile }
  return { port: hermesRemoteFilesAdapter, profile: portOrProfile }
}

export function createRemoteDirectory(
  path: string,
  portOrProfile?: RemoteFilesPort | RemoteFilesProfile,
  profile?: RemoteFilesProfile
): Promise<RemoteFileActionResponse> {
  const remotePath = filePathFromRemoteSource(path)
  const target = portAndProfile(portOrProfile, profile)
  return withRemoteActionError('create-directory', async () => {
    const raw = await target.port.createDirectory(remotePath, target.profile)
    return normalizeRemoteFileActionResponse(raw, remotePath)
  })
}

export function writeRemoteFileDataUrl(
  input: RemoteFileWriteDataUrlInput,
  portOrProfile?: RemoteFilesPort | RemoteFilesProfile,
  profile?: RemoteFilesProfile
): Promise<RemoteFileActionResponse> {
  const remotePath = filePathFromRemoteSource(input.path)
  const target = portAndProfile(portOrProfile, profile)
  return withRemoteActionError('write-data-url', async () => {
    const raw = await target.port.writeDataUrl({ ...input, path: remotePath }, target.profile)
    return normalizeRemoteFileActionResponse(raw, remotePath)
  })
}

export function uploadRemoteFile(
  input: RemoteFileUploadInput,
  portOrProfile?: RemoteFilesPort | RemoteFilesProfile,
  profile?: RemoteFilesProfile
): Promise<RemoteFileActionResponse> {
  const remotePath = filePathFromRemoteSource(input.path)
  const target = portAndProfile(portOrProfile, profile)
  return withRemoteActionError('upload-file', async () => {
    const raw = await target.port.uploadFile({ ...input, path: remotePath }, target.profile)
    return normalizeRemoteFileActionResponse(raw, remotePath)
  })
}

export function readRemoteManagedFileDataUrl(
  path: string,
  portOrProfile?: RemoteFilesPort | RemoteFilesProfile,
  profile?: RemoteFilesProfile
): Promise<RemoteManagedFileDataUrlResponse> {
  const remotePath = filePathFromRemoteSource(path)
  const target = portAndProfile(portOrProfile, profile)
  return withRemoteActionError('read-managed-data-url', async () => {
    const raw = await target.port.readManagedDataUrl(remotePath, target.profile)
    return normalizeRemoteManagedFileDataUrlResponse(raw, remotePath)
  })
}

export function deleteRemotePath(
  path: string,
  options: RemoteFileDeleteOptions | RemoteFilesPort = {},
  profile?: RemoteFilesProfile
): Promise<RemoteFileDeleteResponse> {
  const remotePath = filePathFromRemoteSource(path)
  const target = isRemoteFilesPort(options)
    ? { port: options, profile }
    : { port: hermesRemoteFilesAdapter, profile: options.profile ?? profile }
  const recursive = isRemoteFilesPort(options) ? false : (options.recursive ?? false)

  return withRemoteActionError('delete-path', async () => {
    const raw = await target.port.deletePath(remotePath, recursive, target.profile)
    return normalizeRemoteFileDeleteResponse(raw, remotePath)
  })
}
