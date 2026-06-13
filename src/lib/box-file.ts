export type BoxFileAccent = 'archive' | 'audio' | 'code' | 'file' | 'image' | 'pdf' | 'text' | 'video'
export type BoxFileViewerKind = 'audio' | 'download' | 'image' | 'pdf' | 'text' | 'video'

export interface BoxFilePresentation {
  accent: BoxFileAccent
  extension: string
  glyph: string
  title: string
  viewerKind: BoxFileViewerKind
}

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const PDF_EXTENSIONS = new Set(['pdf'])
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm'])
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba'])
const ARCHIVE_EXTENSIONS = new Set(['7z', 'br', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip'])
const CODE_EXTENSIONS = new Set([
  'c',
  'cpp',
  'css',
  'go',
  'h',
  'html',
  'java',
  'js',
  'jsx',
  'kt',
  'lua',
  'php',
  'py',
  'rb',
  'rs',
  'svelte',
  'swift',
  'ts',
  'tsx',
  'vue'
])
const TEXT_EXTENSIONS = new Set([
  'csv',
  'env',
  'ini',
  'json',
  'jsonl',
  'log',
  'md',
  'markdown',
  'toml',
  'txt',
  'xml',
  'yaml',
  'yml'
])

function extensionFor(name: string): string {
  const clean = name.trim().split(/[?#]/, 1)[0] ?? ''
  const parts = clean.split('.')

  if (parts.length < 2) return ''

  return (parts.pop() ?? '').toLowerCase()
}

function glyphFor(extension: string, fallback: string): string {
  if (!extension) return fallback
  return extension.slice(0, 3).toUpperCase()
}

export function isTextPreviewFile(name: string): boolean {
  const extension = extensionFor(name)
  return TEXT_EXTENSIONS.has(extension) || CODE_EXTENSIONS.has(extension)
}

export function viewerKindForBoxFile(name: string): BoxFileViewerKind {
  const extension = extensionFor(name)

  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (PDF_EXTENSIONS.has(extension)) return 'pdf'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (isTextPreviewFile(name)) return 'text'

  return 'download'
}

export function boxFilePresentation(name: string): BoxFilePresentation {
  const extension = extensionFor(name)
  const viewerKind = viewerKindForBoxFile(name)

  if (viewerKind === 'image') {
    return { accent: 'image', extension, glyph: 'IMG', title: 'Image', viewerKind }
  }

  if (viewerKind === 'pdf') {
    return { accent: 'pdf', extension, glyph: 'PDF', title: 'PDF', viewerKind }
  }

  if (viewerKind === 'video') {
    return { accent: 'video', extension, glyph: 'VID', title: 'Video', viewerKind }
  }

  if (viewerKind === 'audio') {
    return { accent: 'audio', extension, glyph: 'AUD', title: 'Audio', viewerKind }
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return { accent: 'code', extension, glyph: glyphFor(extension, 'CODE'), title: 'Code', viewerKind }
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return { accent: 'text', extension, glyph: glyphFor(extension, 'TXT'), title: 'Text', viewerKind }
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { accent: 'archive', extension, glyph: glyphFor(extension, 'ZIP'), title: 'Archive', viewerKind }
  }

  return { accent: 'file', extension, glyph: glyphFor(extension, 'FILE'), title: 'File', viewerKind }
}
