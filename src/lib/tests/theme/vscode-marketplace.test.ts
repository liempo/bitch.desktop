import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  buildVsCodeMarketplaceThemeQuery,
  downloadVsCodeMarketplaceThemeExtensionPackage,
  importVsCodeExtensionThemes,
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

  it('uses exact Marketplace item-name lookup for publisher.extension queries', () => {
    const body = buildVsCodeMarketplaceThemeQuery({ query: ' DrewXS.Tokyo-Night-Dark ', page: 1, pageSize: 10 })

    expect(body.filters).toEqual([
      expect.objectContaining({
        pageNumber: 1,
        pageSize: 10,
        criteria: expect.arrayContaining([
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          { filterType: 5, value: 'Themes' },
          { filterType: 7, value: 'drewxs.tokyo-night-dark' }
        ])
      })
    ])
    expect(body.filters).not.toEqual([
      expect.objectContaining({
        criteria: expect.arrayContaining([{ filterType: 10, value: 'drewxs.tokyo-night-dark' }])
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
      packageUrl: 'theme-manifest-vsix',
      themes: [{ id: 'dracula', label: 'Dracula', uiTheme: 'vs-dark' }]
    })
  })

  it('queries exact Marketplace item names and hydrates Tokyo Night Dark contributions', async () => {
    const fetchCalls: string[] = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      fetchCalls.push(url)

      if (url === VSCODE_MARKETPLACE_GALLERY_API) {
        const body = JSON.parse(String(init?.body)) as { filters: { criteria: unknown[] }[] }
        expect(body.filters[0].criteria).toEqual(
          expect.arrayContaining([{ filterType: 7, value: 'drewxs.tokyo-night-dark' }])
        )
        expect(body.filters[0].criteria).not.toEqual(
          expect.arrayContaining([{ filterType: 10, value: 'drewxs.tokyo-night-dark' }])
        )

        return jsonResponse({
          results: [
            {
              resultMetadata: [{ metadataType: 'ResultCount', metadataItems: [{ name: 'TotalCount', count: 1 }] }],
              extensions: [
                galleryExtension(
                  'tokyo-night-dark-id',
                  'tokyo-night-dark-manifest',
                  'tokyo-night-dark',
                  'Tokyo Night Dark',
                  'drewxs'
                )
              ]
            }
          ]
        })
      }

      if (url === 'tokyo-night-dark-manifest') {
        return jsonResponse({
          contributes: {
            themes: [
              { label: 'Tokyo Night Dark', uiTheme: 'vs-dark', path: './themes/tokyo-night-dark-color-theme.json' }
            ]
          }
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }

    const result = await searchVsCodeMarketplaceThemes({
      query: 'drewxs.tokyo-night-dark',
      pageSize: 12,
      maxPagesToScan: 1,
      fetchImpl
    })

    expect(fetchCalls).toEqual([VSCODE_MARKETPLACE_GALLERY_API, 'tokyo-night-dark-manifest'])
    expect(result.extensions).toHaveLength(1)
    expect(result.extensions[0]).toMatchObject({
      extensionName: 'tokyo-night-dark',
      displayName: 'Tokyo Night Dark',
      publisherName: 'drewxs',
      themes: [{ label: 'Tokyo Night Dark', uiTheme: 'vs-dark' }]
    })
  })

  it('imports JSONC theme files with VS Code comments and trailing commas', async () => {
    const result = await importVsCodeExtensionThemes([
      {
        name: 'package.json',
        webkitRelativePath: 'extension/package.json',
        text: async () =>
          JSON.stringify({
            name: 'tokyo-night-dark',
            publisher: 'drewxs',
            contributes: {
              themes: [
                {
                  label: 'Tokyo Night Dark',
                  uiTheme: 'vs-dark',
                  path: './themes/tokyo-night-dark-color-theme.json'
                }
              ]
            }
          })
      },
      {
        name: 'tokyo-night-dark-color-theme.json',
        webkitRelativePath: 'extension/themes/tokyo-night-dark-color-theme.json',
        text: async () => `{
          "name": "Tokyo Night Dark",
          "type": "dark",
          "colors": {
            // Actual VS Code themes may be JSONC, not strict JSON.
            "editor.background": "#1a1b26",
            "focusBorder": "#7aa2f7",
          },
        }`
      }
    ])

    expect(result.errors).toEqual([])
    expect(result.themes[0]).toMatchObject({
      id: 'vscode-extension:drewxs-tokyo-night-dark-tokyo-night-dark-extension-themes-tokyo-night-dark-color-theme-json',
      source: { name: 'Tokyo Night Dark', type: 'dark' },
      cssVariables: expect.objectContaining({ '--bits-canvas': '#1a1b26', '--bits-focus': '#7aa2f7' })
    })
  })

  it('downloads a VSIX package and exposes extension files for theme import', async () => {
    const packageBytes = zipSync({
      'extension/package.json': strToU8(
        JSON.stringify({
          name: 'probe-theme',
          publisher: 'liempo',
          contributes: { themes: [{ id: 'probe', label: 'Probe', uiTheme: 'vs-dark', path: './themes/probe.json' }] }
        })
      ),
      'extension/themes/probe.json': strToU8(
        JSON.stringify({
          name: 'Probe',
          type: 'dark',
          colors: { 'editor.background': '#010203', foreground: '#fefefe', focusBorder: '#66ccff' }
        })
      ),
      'extension/README.md': strToU8('# ignored')
    })
    const fetchImpl = async () => binaryResponse(packageBytes)

    const files = await downloadVsCodeMarketplaceThemeExtensionPackage(
      { displayName: 'Probe Theme', packageUrl: 'probe.vsix' },
      { fetchImpl }
    )
    const result = await importVsCodeExtensionThemes(files)

    expect(files.map(file => file.webkitRelativePath)).toEqual([
      'extension/package.json',
      'extension/themes/probe.json'
    ])
    expect(result.errors).toEqual([])
    expect(result.themes[0]).toMatchObject({
      id: 'vscode-extension:liempo-probe-theme-probe-extension-themes-probe-json',
      source: { name: 'Probe', type: 'dark' },
      cssVariables: expect.objectContaining({ '--bits-canvas': '#010203', '--bits-focus': '#66ccff' })
    })
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function binaryResponse(body: Uint8Array): Response {
  const bytes = new Uint8Array(body.byteLength)
  bytes.set(body)
  return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/zip' } })
}

function galleryExtension(
  extensionId: string,
  manifestUrl: string,
  extensionName: string,
  displayName: string,
  publisherName = 'test-publisher'
) {
  return {
    extensionId,
    extensionName,
    displayName,
    shortDescription: `${displayName} description`,
    lastUpdated: '2026-06-30T00:00:00Z',
    publisher: { publisherName, displayName: publisherName === 'test-publisher' ? 'Test Publisher' : publisherName },
    versions: [
      {
        version: '1.2.3',
        files: [
          { assetType: 'Microsoft.VisualStudio.Code.Manifest', source: manifestUrl },
          { assetType: 'Microsoft.VisualStudio.Services.Icons.Default', source: `${manifestUrl}-icon` },
          { assetType: 'Microsoft.VisualStudio.Services.VSIXPackage', source: `${manifestUrl}-vsix` }
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
