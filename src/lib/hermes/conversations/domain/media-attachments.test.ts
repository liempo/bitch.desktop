import { describe, expect, it } from 'vitest'

import {
  attachmentDisplayLabel,
  attachmentFromMediaSource,
  attachmentKindFromMediaSource,
  cloneConversationAttachment,
  extractImageDirectiveSources,
  extractMediaDirectiveSources,
  imageSourcesFromContent,
  mediaLabelFromSource,
  mimeTypeFromDataUrl
} from './media-attachments'

describe('message media attachment helpers', () => {
  const nextId = (prefix: string): string => `${prefix}-id`

  it('classifies media sources without store state', () => {
    expect(attachmentKindFromMediaSource('data:image/png;base64,aW1hZ2U=')).toBe('image')
    expect(attachmentKindFromMediaSource('data:application/pdf;base64,JVBERi0=')).toBe('pdf')
    expect(attachmentKindFromMediaSource('data:audio/mpeg;base64,SUQz')).toBe('audio')
    expect(attachmentKindFromMediaSource('data:video/mp4;base64,AAAA')).toBe('video')
    expect(attachmentKindFromMediaSource('https://cdn.example.test/diagram.WEBP?download=1')).toBe('image')
    expect(attachmentKindFromMediaSource('/opt/data/audio/voice.OPUS')).toBe('audio')
    expect(attachmentKindFromMediaSource('/tmp/capture.webm')).toBe('video')
    expect(attachmentKindFromMediaSource('/opt/data/reports/summary.pdf')).toBe('pdf')
    expect(attachmentKindFromMediaSource('/tmp/notes.txt')).toBe('file')
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
    expect(attachmentFromMediaSource('/tmp/voice.mp3', 'stored-media', nextId)).toEqual({
      id: 'stored-media-id',
      kind: 'audio',
      label: 'voice.mp3',
      path: '/tmp/voice.mp3'
    })
    expect(attachmentFromMediaSource('/tmp/capture.webm', 'stored-media', nextId)).toEqual({
      id: 'stored-media-id',
      kind: 'video',
      label: 'capture.webm',
      path: '/tmp/capture.webm'
    })
    expect(attachmentFromMediaSource('/tmp/notes.txt', 'stored-media', nextId)).toEqual({
      id: 'stored-media-id',
      kind: 'file',
      label: 'notes.txt',
      path: '/tmp/notes.txt'
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
    const cloned = cloneConversationAttachment(original, nextId)

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

  it('extracts @image directives but preserves MEDIA directives for inline remote rendering', () => {
    expect(extractImageDirectiveSources('before\n@image:`/tmp/a.png`\nafter')).toEqual({
      cleanedText: 'before\n\nafter',
      sources: ['/tmp/a.png']
    })

    expect(
      extractMediaDirectiveSources(
        'before\nMEDIA: "/tmp/report.pdf"\nMEDIA: /opt/data/keep.png\nafter MEDIA:`https://cdn.example.test/b.png` done'
      )
    ).toEqual({
      cleanedText:
        'before\nMEDIA: "/tmp/report.pdf"\nMEDIA: /opt/data/keep.png\nafter MEDIA:`https://cdn.example.test/b.png` done',
      sources: []
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
