import { describe, expect, it } from 'vitest'
import filesPageSource from '../app/files/FilesPage.svelte?raw'
import { filePresentation, isTextPreviewFile, viewerKindForFile } from './file-presentation'

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
    expect(filePresentation('archive.zip')).toMatchObject({
      accent: 'archive',
      glyph: 'ZIP',
      viewerKind: 'download'
    })
  })

  it('marks only safe text-like files for fetched inline text previews', () => {
    expect(isTextPreviewFile('README.md')).toBe(true)
    expect(isTextPreviewFile('config.json')).toBe(true)
    expect(isTextPreviewFile('Makefile')).toBe(true)
    expect(filePresentation('WORKSPACE.bazel')).toMatchObject({
      accent: 'text',
      glyph: 'BAZ',
      title: 'Text',
      viewerKind: 'text'
    })
    expect(isTextPreviewFile('photo.png')).toBe(false)
    expect(viewerKindForFile('blob.bin')).toBe('download')
  })
})

describe('remote files page source contract', () => {
  it('uses the authenticated remote filesystem API instead of a public sidecar', () => {
    expect(filesPageSource).toContain('fetchRemoteFileListing')
    expect(filesPageSource).toContain('readRemoteFileText')
    expect(filesPageSource).toContain('readRemoteFileDataUrl')
  })

  it('mounts the remote filesystem root instead of the backend cwd', () => {
    expect(filesPageSource).toContain("await openDirectory('/')")
    expect(filesPageSource).not.toContain('getRemoteDefaultCwd')
  })

  it('uses a two-pane tree plus viewer layout without the icon view', () => {
    expect(filesPageSource).toContain('grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)]')
    expect(filesPageSource).not.toContain('Icon View')
    expect(filesPageSource).not.toContain('iconActions')
  })

  it('includes a first-class file viewer panel', () => {
    expect(filesPageSource).toContain('File Viewer')
    expect(filesPageSource).toContain('selectFile')
  })
})
