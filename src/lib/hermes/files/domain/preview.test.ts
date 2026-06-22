import { describe, expect, it } from 'vitest'
import assetsPageSource from '@/app/assets/AssetsPage.svelte?raw'
import { filePresentation, isTextPreviewFile, viewerKindForRemoteFile } from './preview'

describe('remote file presentation', () => {
  it('classifies image files as thumbnail-backed previews', () => {
    expect(filePresentation('render.PNG')).toMatchObject({
      accent: 'image',
      extension: '.png',
      glyph: 'IMG',
      title: 'Image',
      viewerKind: 'image'
    })
  })

  it('classifies common file families for remote viewers', () => {
    expect(filePresentation('report.pdf')).toMatchObject({ accent: 'pdf', glyph: 'PDF', viewerKind: 'pdf' })
    expect(filePresentation('notes.md')).toMatchObject({ accent: 'text', glyph: 'MD', viewerKind: 'text' })
    expect(filePresentation('clip.webm')).toMatchObject({ accent: 'video', glyph: 'VID', viewerKind: 'video' })
    expect(filePresentation('voice.mp3')).toMatchObject({ accent: 'audio', glyph: 'AUD', viewerKind: 'audio' })
    expect(filePresentation('render.html')).toMatchObject({ accent: 'html', glyph: 'HTML', viewerKind: 'html' })
    expect(filePresentation('archive.zip')).toMatchObject({ accent: 'text', glyph: 'ZIP', viewerKind: 'text' })
  })

  it('marks text-like and opaque files for fetched inline text previews', () => {
    expect(isTextPreviewFile('README.md')).toBe(true)
    expect(isTextPreviewFile('config.json')).toBe(true)
    expect(isTextPreviewFile('Makefile')).toBe(true)
    expect(filePresentation('WORKSPACE.bazel')).toMatchObject({
      accent: 'text',
      glyph: 'BAZ',
      title: 'Text',
      viewerKind: 'text'
    })
    expect(filePresentation('archive.zip')).toMatchObject({
      accent: 'text',
      glyph: 'ZIP',
      title: 'Text',
      viewerKind: 'text'
    })
    expect(isTextPreviewFile('photo.png')).toBe(false)
    expect(viewerKindForRemoteFile('blob.bin')).toBe('text')
  })
})

describe('remote assets page source contract', () => {
  it('uses the authenticated remote filesystem API instead of a public sidecar', () => {
    expect(assetsPageSource).toContain('fetchRemoteFileListing')
    expect(assetsPageSource).toContain('readRemoteFileText')
    expect(assetsPageSource).toContain('readRemoteFileDataUrl')
  })

  it('mounts the remote filesystem root instead of the backend cwd', () => {
    expect(assetsPageSource).toContain("await openDirectory('/')")
    expect(assetsPageSource).not.toContain('getRemoteDefaultCwd')
  })

  it('uses a two-pane tree plus viewer layout without the icon view', () => {
    expect(assetsPageSource).toContain('grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)]')
    expect(assetsPageSource).not.toContain('Icon View')
    expect(assetsPageSource).not.toContain('iconActions')
  })

  it('includes a first-class asset viewer panel', () => {
    expect(assetsPageSource).toContain('Asset Viewer')
    expect(assetsPageSource).toContain('selectFile')
  })

  it('shows text returned for unknown files without blocking on the binary hint', () => {
    expect(assetsPageSource).toContain('textPreview = response.text')
    expect(assetsPageSource).not.toContain('Remote file is binary; text preview is unavailable.')
  })

  it('does not retain the obsolete no-inline-viewer fallback for remote files', () => {
    expect(assetsPageSource).toContain("viewerKind === 'text' || viewerKind === 'download'")
    expect(assetsPageSource).not.toContain('No inline viewer for this file type')
  })
})
