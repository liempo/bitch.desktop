export interface LocalFilesPort {
  list(path: string): Promise<never>
  readDataUrl(path: string): Promise<never>
  readText(path: string): Promise<never>
}

function unavailableLocalFileAccess(path: string): Promise<never> {
  return Promise.reject(
    new Error(
      `Local filesystem access is unavailable in the remote-only BITCH app. Use Hermes remote files for ${path}.`
    )
  )
}

export function createUnavailableLocalFilesPort(): LocalFilesPort {
  return {
    list: unavailableLocalFileAccess,
    readDataUrl: unavailableLocalFileAccess,
    readText: unavailableLocalFileAccess
  }
}
