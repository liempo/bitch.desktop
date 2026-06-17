import { describe, expect, it } from 'vitest'

import {
  attachmentDisplayLabel,
  attachmentFromMediaSource,
  attachmentKindFromMediaSource,
  cloneThreadAttachment,
  extractImageDirectiveSources,
  extractMediaDirectiveSources,
  imageSourcesFromContent,
  mediaLabelFromSource,
  mimeTypeFromDataUrl
} from '$lib/messages/media-attachments'

describe('message media attachment helpers', () => {
  const nextId = (prefix: string): string => `${prefix}-id`

  it('classifies media sources without store state', () => {
    expect(attachmentKindFromMediaSource('data:image/png;base64,aW1hZ2U=')).toBe('image')
    expect(attachmentKindFromMediaSource('data:application/pdf;base64,JVBERi0=')).toBe('pdf')
    expect(attachmentKindFromMediaSource('https://cdn.example.test/diagram.WEBP?download=1')).toBe('image')
    expect(attachmentKindFromMediaSource('/box/reports/summary.pdf')).toBe('pdf')
    expect(attachmentKindFromMediaSource('/tmp/notes.txt')).toBeNull()
  })

  it('creates deterministic attachment records from URLs, paths, and data URLs', () => {
    expect(
      attachmentFromMediaSource(' https://cdn.example.test/images/screen.png?token=redacted ', 'stored-media', nextId)
    ).toEqual({
      id: 'stored-media-id',
      kind: 'image',
      label: 'screen.png',
      url: 'https://cdn.example.test/images/screen.png?token=redacted'
    })
    expect(attachmentFromMediaSource('data:application/pdf;base64,JVBERi0=', 'stored-media', nextId)).toEqual({
      dataUrl: 'data:application/pdf;base64,JVBERi0=',
      id: 'stored-media-id',
      kind: 'pdf',
      label: 'document.pdf',
      mediaType: 'application/pdf'
    })
    expect(attachmentFromMediaSource('/opt/data/screenshot.jpg', 'stored-media', nextId)).toEqual({
      id: 'stored-media-id',
      kind: 'image',
      label: 'screenshot.jpg',
      path: '/opt/data/screenshot.jpg'
    })
  })

  it('formats labels and clones composer-provided attachments without leaking mutable input', () => {
    expect(mediaLabelFromSource('data:image/png;base64,aW1hZ2U=')).toBe('image')
    expect(mediaLabelFromSource('data:application/pdf;base64,JVBERi0=', 'pdf')).toBe('document.pdf')
    expect(mimeTypeFromDataUrl('data:image/webp;base64,aW1hZ2U=')).toBe('image/webp')
    expect(attachmentDisplayLabel({ kind: 'pdf', label: 'spec.pdf', size: 1536 })).toBe('spec.pdf (1.5 KB)')
    expect(attachmentDisplayLabel({ detail: 'source: tool', kind: 'image', label: 'plot.png' })).toBe(
      'plot.png (source: tool)'
    )

    const original = { kind: 'image' as const, label: 'plot.png', previewUrl: 'data:image/png;base64,aW1hZ2U=' }
    const cloned = cloneThreadAttachment(original, nextId)

    expect(cloned).toEqual({
      dataUrl: undefined,
      detail: undefined,
      id: 'image-id',
      kind: 'image',
      label: 'plot.png',
      mediaType: undefined,
      path: undefined,
      previewUrl: 'data:image/png;base64,aW1hZ2U=',
      size: undefined,
      url: undefined
    })
    expect(cloned).not.toBe(original)
  })

  it('extracts image and media directives while preserving /box media references for preview rendering', () => {
    expect(extractImageDirectiveSources('before\n@image:`/tmp/a.png`\nafter')).toEqual({
      cleanedText: 'before\n\nafter',
      sources: ['/tmp/a.png']
    })

    expect(
      extractMediaDirectiveSources(
        'before\nMEDIA: "/tmp/report.pdf"\nMEDIA: /box/keep.png\nafter MEDIA:`https://cdn.example.test/b.png` done'
      )
    ).toEqual({
      cleanedText: 'before\n\nMEDIA: /box/keep.png\nafter  done',
      sources: ['/tmp/report.pdf', 'https://cdn.example.test/b.png']
    })
  })

  it('collects embedded image sources from nested content payloads', () => {
    expect(
      imageSourcesFromContent([
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
        { content: [{ type: 'image_url', image_url: 'https://cdn.example.test/nested.webp' }] },
        { text: 'inline data:image/png;base64,Y2hhcnQ=' }
      ])
    ).toEqual([
      'data:image/png;base64,aW1hZ2U=',
      'https://cdn.example.test/nested.webp',
      'data:image/png;base64,Y2hhcnQ='
    ])
  })
})
