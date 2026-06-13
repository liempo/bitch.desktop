import { describe, expect, it } from 'vitest'
import boxPageSource from '../app/box/BoxPage.svelte?raw'
import { boxFilePresentation, isTextPreviewFile, viewerKindForBoxFile } from './box-file'

describe('BOX file presentation', () => {
  it('classifies image files as thumbnail-backed previews', () => {
    expect(boxFilePresentation('render.PNG')).toMatchObject({
      accent: 'image',
      extension: 'png',
      glyph: 'IMG',
      title: 'Image',
      viewerKind: 'image'
    })
  })

  it('classifies common file families for thumbnails and viewers', () => {
    expect(boxFilePresentation('report.pdf')).toMatchObject({ accent: 'pdf', glyph: 'PDF', viewerKind: 'pdf' })
    expect(boxFilePresentation('notes.md')).toMatchObject({ accent: 'text', glyph: 'MD', viewerKind: 'text' })
    expect(boxFilePresentation('clip.webm')).toMatchObject({ accent: 'video', glyph: 'VID', viewerKind: 'video' })
    expect(boxFilePresentation('voice.mp3')).toMatchObject({ accent: 'audio', glyph: 'AUD', viewerKind: 'audio' })
    expect(boxFilePresentation('archive.zip')).toMatchObject({
      accent: 'archive',
      glyph: 'ZIP',
      viewerKind: 'download'
    })
  })

  it('marks only safe text-like files for fetched inline text previews', () => {
    expect(isTextPreviewFile('README.md')).toBe(true)
    expect(isTextPreviewFile('config.json')).toBe(true)
    expect(isTextPreviewFile('photo.png')).toBe(false)
    expect(viewerKindForBoxFile('unknown.bin')).toBe('download')
  })
})

describe('BOX page source contract', () => {
  it('does not expose Dufs implementation branding in the visible browser chrome', () => {
    expect(boxPageSource).not.toContain('Dufs')
  })

  it('includes a first-class file viewer panel', () => {
    expect(boxPageSource).toContain('File Viewer')
    expect(boxPageSource).toContain('selectFile')
  })
})
