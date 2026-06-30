export type VsCodeMarketplaceThemeSort = 'install-count' | 'last-updated' | 'rating' | 'relevance'

export type VsCodeMarketplaceThemeQuery = {
  query?: string
  page?: number
  pageSize?: number
  sort?: VsCodeMarketplaceThemeSort
}

export type VsCodeMarketplaceThemeContribution = {
  id?: string
  label: string
  uiTheme?: string
}

export type VsCodeMarketplaceThemeExtension = {
  extensionId: string
  extensionName: string
  displayName: string
  publisherName: string
  publisherDisplayName: string
  shortDescription: string
  version: string
  lastUpdated?: string
  installCount?: number
  averageRating?: number
  ratingCount?: number
  marketplaceUrl: string
  iconUrl?: string
  manifestUrl?: string
  themes: VsCodeMarketplaceThemeContribution[]
}

export type VsCodeMarketplaceThemeSearchResult = {
  extensions: VsCodeMarketplaceThemeExtension[]
  page: number
  pageSize: number
  scanned: number
  totalThemeCategoryMatches: number
}

export type VsCodeGalleryExtension = {
  extensionId?: unknown
  extensionName?: unknown
  displayName?: unknown
  shortDescription?: unknown
  lastUpdated?: unknown
  publisher?: {
    publisherName?: unknown
    displayName?: unknown
  }
  versions?: {
    version?: unknown
    files?: {
      assetType?: unknown
      source?: unknown
    }[]
  }[]
  statistics?: {
    statisticName?: unknown
    value?: unknown
  }[]
}

export type VsCodeGalleryExtensionQueryResponse = {
  results?: {
    extensions?: VsCodeGalleryExtension[]
    resultMetadata?: {
      metadataType?: unknown
      metadataItems?: {
        name?: unknown
        count?: unknown
      }[]
    }[]
  }[]
}

type GalleryVersion = NonNullable<VsCodeGalleryExtension['versions']>[number]
type GalleryResultMetadata = NonNullable<
  NonNullable<VsCodeGalleryExtensionQueryResponse['results']>[number]['resultMetadata']
>

export const VSCODE_MARKETPLACE_GALLERY_API = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery'

const VSCODE_TARGET = 'Microsoft.VisualStudio.Code'
const THEMES_CATEGORY = 'Themes'
const FILTER_TYPE_CATEGORY = 5
const FILTER_TYPE_TARGET = 8
const FILTER_TYPE_SEARCH_TEXT = 10
const SORT_BY = {
  'install-count': 4,
  'last-updated': 1,
  rating: 12,
  relevance: 0
} satisfies Record<VsCodeMarketplaceThemeSort, number>
const SORT_ORDER_DESCENDING = 0
const GALLERY_FLAGS_WITH_ASSETS = 914
const MANIFEST_ASSET = 'Microsoft.VisualStudio.Code.Manifest'
const DEFAULT_ICON_ASSET = 'Microsoft.VisualStudio.Services.Icons.Default'
const SMALL_ICON_ASSET = 'Microsoft.VisualStudio.Services.Icons.Small'

export function buildVsCodeMarketplaceThemeQuery(query: VsCodeMarketplaceThemeQuery): Record<string, unknown> {
  const normalizedQuery = query.query?.trim()
  const page = Math.max(1, Math.trunc(query.page ?? 1))
  const pageSize = clampPageSize(query.pageSize ?? 20)

  return {
    filters: [
      {
        criteria: [
          { filterType: FILTER_TYPE_TARGET, value: VSCODE_TARGET },
          { filterType: FILTER_TYPE_CATEGORY, value: THEMES_CATEGORY },
          ...(normalizedQuery ? [{ filterType: FILTER_TYPE_SEARCH_TEXT, value: normalizedQuery }] : [])
        ],
        pageNumber: page,
        pageSize,
        sortBy: SORT_BY[query.sort ?? 'install-count'],
        sortOrder: SORT_ORDER_DESCENDING
      }
    ],
    assetTypes: [],
    flags: GALLERY_FLAGS_WITH_ASSETS
  }
}

export function parseVsCodeMarketplaceThemeSearchResponse(
  response: VsCodeGalleryExtensionQueryResponse,
  query: Required<Pick<VsCodeMarketplaceThemeQuery, 'page' | 'pageSize'>>
): Omit<VsCodeMarketplaceThemeSearchResult, 'extensions'> & {
  extensions: Omit<VsCodeMarketplaceThemeExtension, 'themes'>[]
} {
  const result = response.results?.[0]
  const extensions = (result?.extensions ?? []).flatMap(extension => {
    const parsed = parseGalleryExtension(extension)
    return parsed ? [parsed] : []
  })

  return {
    extensions,
    page: query.page,
    pageSize: query.pageSize,
    scanned: extensions.length,
    totalThemeCategoryMatches: totalCount(result?.resultMetadata)
  }
}

export function themeContributionsFromMarketplaceManifest(manifest: unknown): VsCodeMarketplaceThemeContribution[] {
  if (!isRecord(manifest) || !isRecord(manifest.contributes) || !Array.isArray(manifest.contributes.themes)) return []

  return manifest.contributes.themes.flatMap(item => {
    if (!isRecord(item)) return []
    const label = nonEmptyString(item.label) ?? nonEmptyString(item.id)
    if (!label) return []

    return [
      {
        id: nonEmptyString(item.id),
        label,
        uiTheme: nonEmptyString(item.uiTheme)
      }
    ]
  })
}

export function withMarketplaceThemeContributions(
  extension: Omit<VsCodeMarketplaceThemeExtension, 'themes'>,
  themes: readonly VsCodeMarketplaceThemeContribution[]
): VsCodeMarketplaceThemeExtension {
  return { ...extension, themes: [...themes] }
}

function parseGalleryExtension(
  extension: VsCodeGalleryExtension
): Omit<VsCodeMarketplaceThemeExtension, 'themes'> | undefined {
  const extensionId = nonEmptyString(extension.extensionId)
  const extensionName = nonEmptyString(extension.extensionName)
  const displayName = nonEmptyString(extension.displayName)
  const publisherName = nonEmptyString(extension.publisher?.publisherName)
  const version = extension.versions?.[0]
  const versionName = nonEmptyString(version?.version)

  if (!extensionId || !extensionName || !displayName || !publisherName || !versionName) return undefined

  return {
    extensionId,
    extensionName,
    displayName,
    publisherName,
    publisherDisplayName: nonEmptyString(extension.publisher?.displayName) ?? publisherName,
    shortDescription: nonEmptyString(extension.shortDescription) ?? '',
    version: versionName,
    lastUpdated: nonEmptyString(extension.lastUpdated),
    installCount: statistic(extension, 'install'),
    averageRating: statistic(extension, 'averagerating'),
    ratingCount: statistic(extension, 'ratingcount'),
    marketplaceUrl: `https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(`${publisherName}.${extensionName}`)}`,
    iconUrl: assetSource(version, DEFAULT_ICON_ASSET) ?? assetSource(version, SMALL_ICON_ASSET),
    manifestUrl: assetSource(version, MANIFEST_ASSET)
  }
}

function assetSource(version: GalleryVersion | undefined, assetType: string): string | undefined {
  const source = version?.files?.find(file => file.assetType === assetType)?.source
  return typeof source === 'string' ? source : undefined
}

function statistic(extension: VsCodeGalleryExtension, statisticName: string): number | undefined {
  const value = extension.statistics?.find(item => item.statisticName === statisticName)?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function totalCount(metadata?: GalleryResultMetadata): number {
  const count = metadata
    ?.find(item => item.metadataType === 'ResultCount')
    ?.metadataItems?.find(item => item.name === 'TotalCount')?.count

  return typeof count === 'number' && Number.isFinite(count) ? count : 0
}

function clampPageSize(pageSize: number): number {
  return Math.min(50, Math.max(1, Math.trunc(pageSize)))
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
