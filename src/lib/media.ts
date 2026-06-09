import { dashboardRequest } from '$lib/api/dashboard'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'])

export interface GatewayMediaResponse {
  data_url: string
}

export function filePathFromMediaPath(path: string): string {
  if (path.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(path).pathname)
    } catch {
      return path.replace(/^file:\/\//, '')
    }
  }

  return path
}

export function mediaExtension(path: string): string {
  const file = filePathFromMediaPath(path).split(/[?#]/, 1)[0] ?? ''
  const name = file.split(/[\\/]/).pop() ?? file
  const dot = name.lastIndexOf('.')

  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function isRemoteGatewayMediaPath(path: string): boolean {
  const value = path.trim()

  if (!value) return false
  if (/^(?:https?|data|blob):/i.test(value)) return false

  return IMAGE_EXTENSIONS.has(mediaExtension(value))
}

export async function gatewayMediaDataUrl(path: string, profile?: null | string): Promise<string> {
  const file = filePathFromMediaPath(path)
  const result = await dashboardRequest<GatewayMediaResponse>({
    path: `/api/media?path=${encodeURIComponent(file)}`,
    profile
  })

  return result.data_url
}
