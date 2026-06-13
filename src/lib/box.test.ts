import { describe, expect, it, vi } from 'vitest'

import { BOX_BASE_URL, boxListingUrl, boxUrlForAgentPath, fetchBoxListing, normalizeBoxListing } from './box'

describe('BOX browser helpers', () => {
  it('uses the Homestation BOX base URL by default', () => {
    expect(BOX_BASE_URL).toBe('https://box.airplane-skilift.ts.net')
  })

  it('derives Dufs URLs from agent-visible /box paths', () => {
    expect(boxUrlForAgentPath('/box/.hermes/audio cache/render 1.png')).toBe(
      'https://box.airplane-skilift.ts.net/.hermes/audio%20cache/render%201.png'
    )
    expect(boxUrlForAgentPath('file:///box/wiki/personal/Hermes%20Box.md')).toBe(
      'https://box.airplane-skilift.ts.net/wiki/personal/Hermes%20Box.md'
    )
    expect(boxUrlForAgentPath('/opt/data/not-box.png')).toBeNull()
  })

  it('builds JSON listing URLs for Dufs paths', () => {
    expect(boxListingUrl('/')).toBe('https://box.airplane-skilift.ts.net/?json')
    expect(boxListingUrl('/wiki/personal')).toBe('https://box.airplane-skilift.ts.net/wiki/personal/?json')
  })

  it('normalizes Dufs JSON listings into sorted browser entries', () => {
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
          url: 'https://box.airplane-skilift.ts.net/wiki/personal/'
        },
        {
          kind: 'file',
          mtime: 10,
          name: 'note.md',
          path: '/wiki/note.md',
          size: 512,
          url: 'https://box.airplane-skilift.ts.net/wiki/note.md'
        }
      ],
      path: '/wiki'
    })
  })

  it('fetches and normalizes a Dufs listing', async () => {
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
    expect(fetchImpl).toHaveBeenCalledWith('https://box.airplane-skilift.ts.net/?json', {
      headers: { Accept: 'application/json' }
    })
  })
})
