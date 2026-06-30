import { strFromU8, unzipSync } from 'fflate'

import type { VsCodeThemeFile } from '../domain/vscode-extension-theme'
import {
  buildVsCodeMarketplaceThemeQuery,
  parseVsCodeMarketplaceThemeSearchResponse,
  themeContributionsFromMarketplaceManifest,
  VSCODE_MARKETPLACE_GALLERY_API,
  withMarketplaceThemeContributions,
  type VsCodeGalleryExtensionQueryResponse,
  type VsCodeMarketplaceThemeExtension,
  type VsCodeMarketplaceThemeQuery,
  type VsCodeMarketplaceThemeSearchResult
} from '../domain/vscode-marketplace'

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SearchVsCodeMarketplaceThemeOptions = VsCodeMarketplaceThemeQuery & {
  fetchImpl?: FetchLike
  maxPagesToScan?: number
}

export type DownloadVsCodeMarketplaceThemePackageOptions = {
  fetchImpl?: FetchLike
}

const DEFAULT_PAGE_SIZE = 12
const DEFAULT_SCAN_PAGE_SIZE = 24
const DEFAULT_MAX_PAGES_TO_SCAN = 3

export async function searchVsCodeMarketplaceThemes(
  options: SearchVsCodeMarketplaceThemeOptions = {}
): Promise<VsCodeMarketplaceThemeSearchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const desiredPageSize = clamp(options.pageSize ?? DEFAULT_PAGE_SIZE, 1, 24)
  const scanPageSize = Math.max(DEFAULT_SCAN_PAGE_SIZE, desiredPageSize)
  const firstPage = Math.max(1, Math.trunc(options.page ?? 1))
  const maxPagesToScan = clamp(options.maxPagesToScan ?? DEFAULT_MAX_PAGES_TO_SCAN, 1, 5)
  const extensions: VsCodeMarketplaceThemeExtension[] = []
  let scanned = 0
  let totalThemeCategoryMatches = 0

  for (let pageOffset = 0; pageOffset < maxPagesToScan && extensions.length < desiredPageSize; pageOffset += 1) {
    const page = firstPage + pageOffset
    const response = await fetchImpl(VSCODE_MARKETPLACE_GALLERY_API, {
      method: 'POST',
      headers: {
        Accept: 'application/json;api-version=7.2-preview.1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildVsCodeMarketplaceThemeQuery({ ...options, page, pageSize: scanPageSize }))
    })

    if (!response.ok) {
      throw new Error(`VS Code Marketplace search failed: ${response.status} ${response.statusText}`.trim())
    }

    const parsed = parseVsCodeMarketplaceThemeSearchResponse(
      (await response.json()) as VsCodeGalleryExtensionQueryResponse,
      { page, pageSize: scanPageSize }
    )
    scanned += parsed.scanned
    totalThemeCategoryMatches = Math.max(totalThemeCategoryMatches, parsed.totalThemeCategoryMatches)

    const hydrated = await hydrateMarketplaceThemeContributions(parsed.extensions, fetchImpl)
    extensions.push(...hydrated.filter(extension => extension.themes.length > 0))
  }

  return {
    extensions: uniqueMarketplaceExtensions(extensions).slice(0, desiredPageSize),
    page: firstPage,
    pageSize: desiredPageSize,
    scanned,
    totalThemeCategoryMatches
  }
}

export async function downloadVsCodeMarketplaceThemeExtensionPackage(
  extension: Pick<VsCodeMarketplaceThemeExtension, 'displayName' | 'packageUrl'>,
  options: DownloadVsCodeMarketplaceThemePackageOptions = {}
): Promise<VsCodeThemeFile[]> {
  if (!extension.packageUrl) {
    throw new Error(`${extension.displayName} does not expose a VSIX package URL.`)
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(extension.packageUrl, {
    headers: { Accept: 'application/zip, application/octet-stream' }
  })

  if (!response.ok) {
    throw new Error(`VSIX download failed: ${response.status} ${response.statusText}`.trim())
  }

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const files = Object.entries(archive).flatMap(([path, content]) => {
    if (!isInstallCandidate(path)) return []

    return [
      {
        name: basename(path),
        webkitRelativePath: path,
        text: async () => strFromU8(content)
      } satisfies VsCodeThemeFile
    ]
  })

  if (!files.some(file => basename(file.webkitRelativePath ?? file.name) === 'package.json')) {
    throw new Error(`${extension.displayName} package did not contain an extension manifest.`)
  }

  return files
}

async function hydrateMarketplaceThemeContributions(
  extensions: Omit<VsCodeMarketplaceThemeExtension, 'themes'>[],
  fetchImpl: FetchLike
): Promise<VsCodeMarketplaceThemeExtension[]> {
  return Promise.all(
    extensions.map(async extension => {
      if (!extension.manifestUrl) return withMarketplaceThemeContributions(extension, [])

      try {
        const response = await fetchImpl(extension.manifestUrl, { headers: { Accept: 'application/json' } })
        if (!response.ok) return withMarketplaceThemeContributions(extension, [])

        return withMarketplaceThemeContributions(
          extension,
          themeContributionsFromMarketplaceManifest(await response.json())
        )
      } catch {
        return withMarketplaceThemeContributions(extension, [])
      }
    })
  )
}

function uniqueMarketplaceExtensions(
  extensions: readonly VsCodeMarketplaceThemeExtension[]
): VsCodeMarketplaceThemeExtension[] {
  return [...new Map(extensions.map(extension => [extension.extensionId, extension])).values()]
}

function isInstallCandidate(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized === 'package.json' || normalized.endsWith('/package.json') || normalized.endsWith('.json')
}

function basename(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
