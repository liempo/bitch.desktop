import { describe, expect, it } from 'vitest'

import {
  buildVsCodeMarketplaceThemeQuery,
  searchVsCodeMarketplaceThemes,
  themeContributionsFromMarketplaceManifest,
  VSCODE_MARKETPLACE_GALLERY_API
} from '$lib/theme'

describe('VS Code Marketplace theme browsing', () => {
  it('builds Marketplace gallery queries locked to VS Code theme extensions', () => {
    const body = buildVsCodeMarketplaceThemeQuery({ query: ' dracula ', page: 2, pageSize: 10, sort: 'install-count' })

    expect(body).toMatchObject({ flags: 914, assetTypes: [] })
    expect(body.filters).toEqual([
      expect.objectContaining({
        pageNumber: 2,
        pageSize: 10,
        sortBy: 4,
        criteria: expect.arrayContaining([
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          { filterType: 5, value: 'Themes' },
          { filterType: 10, value: 'dracula' }
        ])
      })
    ])
  })

  it('recognizes color-theme contributions from extension manifests', () => {
    expect(
      themeContributionsFromMarketplaceManifest({
        contributes: {
          themes: [
            { id: 'night', label: 'Night', uiTheme: 'vs-dark' },
            { id: 'day', label: 'Day', uiTheme: 'vs' }
          ],
          iconThemes: [{ id: 'icons' }]
        }
      })
    ).toEqual([
      { id: 'night', label: 'Night', uiTheme: 'vs-dark' },
      { id: 'day', label: 'Day', uiTheme: 'vs' }
    ])

    expect(themeContributionsFromMarketplaceManifest({ contributes: { iconThemes: [{ id: 'icons' }] } })).toEqual([])
  })

  it('queries the live Marketplace API shape and filters category results to color-theme extensions', async () => {
    const fetchCalls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      fetchCalls.push(url)

      if (url === VSCODE_MARKETPLACE_GALLERY_API) {
        const body = JSON.parse(String(init?.body)) as { filters: { criteria: unknown[] }[] }
        expect(body.filters[0].criteria).toEqual(expect.arrayContaining([{ filterType: 10, value: 'dracula' }]))

        return jsonResponse({
          results: [
            {
              resultMetadata: [{ metadataType: 'ResultCount', metadataItems: [{ name: 'TotalCount', count: 2 }] }],
              extensions: [
                galleryExtension('theme-id', 'theme-manifest', 'dracula-theme', 'Dracula Theme Official'),
                galleryExtension('icon-id', 'icon-manifest', 'material-icon-theme', 'Material Icon Theme')
              ]
            }
          ]
        })
      }

      if (url === 'theme-manifest') {
        return jsonResponse({ contributes: { themes: [{ id: 'dracula', label: 'Dracula', uiTheme: 'vs-dark' }] } })
      }

      if (url === 'icon-manifest') {
        return jsonResponse({ contributes: { iconThemes: [{ id: 'material-icons' }] } })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }

    const result = await searchVsCodeMarketplaceThemes({ query: 'dracula', pageSize: 2, maxPagesToScan: 1, fetchImpl })

    expect(fetchCalls).toEqual([VSCODE_MARKETPLACE_GALLERY_API, 'theme-manifest', 'icon-manifest'])
    expect(result).toMatchObject({ scanned: 2, totalThemeCategoryMatches: 2 })
    expect(result.extensions).toHaveLength(1)
    expect(result.extensions[0]).toMatchObject({
      extensionId: 'theme-id',
      displayName: 'Dracula Theme Official',
      publisherName: 'test-publisher',
      themes: [{ id: 'dracula', label: 'Dracula', uiTheme: 'vs-dark' }]
    })
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function galleryExtension(extensionId: string, manifestUrl: string, extensionName: string, displayName: string) {
  return {
    extensionId,
    extensionName,
    displayName,
    shortDescription: `${displayName} description`,
    lastUpdated: '2026-06-30T00:00:00Z',
    publisher: { publisherName: 'test-publisher', displayName: 'Test Publisher' },
    versions: [
      {
        version: '1.2.3',
        files: [
          { assetType: 'Microsoft.VisualStudio.Code.Manifest', source: manifestUrl },
          { assetType: 'Microsoft.VisualStudio.Services.Icons.Default', source: `${manifestUrl}-icon` }
        ]
      }
    ],
    statistics: [
      { statisticName: 'install', value: 1000 },
      { statisticName: 'averagerating', value: 4.5 },
      { statisticName: 'ratingcount', value: 12 }
    ]
  }
}
