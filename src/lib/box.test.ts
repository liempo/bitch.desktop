import { afterEach, describe, expect, it, vi } from 'vitest'
import exampleEnv from '../../.env.example?raw'
import boxSource from './box.ts?raw'

const TEST_BOX_BASE_URL = 'https://box.example.test'
const exampleBoxBaseUrl = exampleEnv.match(/^VITE_BOX_BASE_URL=(.+)$/m)?.[1] ?? ''

async function loadBoxHelpers(boxBaseUrl = TEST_BOX_BASE_URL): Promise<typeof import('./box')> {
  vi.resetModules()
  vi.stubEnv('VITE_BOX_BASE_URL', boxBaseUrl)
  return import('./box')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('BOX browser helpers', () => {
  it('does not hardcode the configured public BOX origin in helper code', () => {
    expect(exampleBoxBaseUrl).toBeTruthy()
    expect(boxSource).not.toContain(exampleBoxBaseUrl)
  })

  it('uses the configured Vite BOX base URL by default', async () => {
    const { BOX_BASE_URL } = await loadBoxHelpers()

    expect(BOX_BASE_URL).toBe(TEST_BOX_BASE_URL)
  })

  it('does not fall back to a production URL when VITE_BOX_BASE_URL is blank', async () => {
    const { BOX_BASE_URL } = await loadBoxHelpers('')

    expect(BOX_BASE_URL).toBe('')
  })

  it('derives Dufs URLs from agent-visible /box paths', async () => {
    const { boxUrlForAgentPath } = await loadBoxHelpers()

    expect(boxUrlForAgentPath('/box/.hermes/audio cache/render 1.png')).toBe(
      `${TEST_BOX_BASE_URL}/.hermes/audio%20cache/render%201.png`
    )
    expect(boxUrlForAgentPath('file:///box/wiki/personal/Hermes%20Box.md')).toBe(
      `${TEST_BOX_BASE_URL}/wiki/personal/Hermes%20Box.md`
    )
    expect(boxUrlForAgentPath('/opt/data/not-box.png')).toBeNull()
  })

  it('builds JSON listing URLs for Dufs paths', async () => {
    const { boxListingUrl } = await loadBoxHelpers()

    expect(boxListingUrl('/')).toBe(`${TEST_BOX_BASE_URL}/?json`)
    expect(boxListingUrl('/wiki/personal')).toBe(`${TEST_BOX_BASE_URL}/wiki/personal/?json`)
  })

  it('normalizes Dufs JSON listings into sorted browser entries', async () => {
    const { normalizeBoxListing } = await loadBoxHelpers()

    expect(
      normalizeBoxListing(
        {
          allow_search: true,
          href: '/wiki',
          paths: [
            { mtime: 10, name: 'note.md', path_type: 'File', size: 512 },
            { mtime: 11, name: 'personal', path_type: 'Dir', size: 2 }
          ]
        },
        '/wiki'
      )
    ).toEqual({
      allowSearch: true,
      entries: [
        {
          kind: 'directory',
          mtime: 11,
          name: 'personal',
          path: '/wiki/personal',
          size: 2,
          url: `${TEST_BOX_BASE_URL}/wiki/personal/`
        },
        {
          kind: 'file',
          mtime: 10,
          name: 'note.md',
          path: '/wiki/note.md',
          size: 512,
          url: `${TEST_BOX_BASE_URL}/wiki/note.md`
        }
      ],
      path: '/wiki'
    })
  })

  it('fetches and normalizes a Dufs listing', async () => {
    const { fetchBoxListing } = await loadBoxHelpers()
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            href: '/',
            paths: [{ name: '.hermes', path_type: 'Dir', size: 1 }]
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 }
        )
    )

    await expect(fetchBoxListing('/', { fetchImpl })).resolves.toMatchObject({
      entries: [{ kind: 'directory', name: '.hermes', path: '/.hermes' }],
      path: '/'
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${TEST_BOX_BASE_URL}/?json`, {
      headers: { Accept: 'application/json' }
    })
  })
})
