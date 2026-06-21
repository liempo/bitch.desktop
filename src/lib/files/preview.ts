import { remoteFileExtension, viewerKindForRemoteFile, type RemoteFileViewerKind } from './remote'

export type FileAccent = 'archive' | 'audio' | 'code' | 'file' | 'html' | 'image' | 'pdf' | 'text' | 'video'
type FileViewerKind = RemoteFileViewerKind

export interface FilePresentation {
  accent: FileAccent
  extension: string
  glyph: string
  title: string
  viewerKind: FileViewerKind
}

const ARCHIVE_EXTENSIONS = new Set(['.7z', '.br', '.bz2', '.gz', '.rar', '.tar', '.tgz', '.xz', '.zip'])
const CODE_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.css',
  '.go',
  '.h',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.kt',
  '.lua',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.svelte',
  '.swift',
  '.ts',
  '.tsx',
  '.vue'
])
const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.env',
  '.ini',
  '.json',
  '.jsonl',
  '.log',
  '.md',
  '.markdown',
  '.toml',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
])

function glyphFor(extension: string, fallback: string): string {
  if (!extension) return fallback
  return extension.replace(/^\./, '').slice(0, 3).toUpperCase()
}

export function isTextPreviewFile(name: string): boolean {
  return viewerKindForRemoteFile(name) === 'text'
}

export function filePresentation(name: string): FilePresentation {
  const extension = remoteFileExtension(name)
  const viewerKind = viewerKindForRemoteFile(name)

  if (viewerKind === 'image') return { accent: 'image', extension, glyph: 'IMG', title: 'Image', viewerKind }
  if (viewerKind === 'pdf') return { accent: 'pdf', extension, glyph: 'PDF', title: 'PDF', viewerKind }
  if (viewerKind === 'video') return { accent: 'video', extension, glyph: 'VID', title: 'Video', viewerKind }
  if (viewerKind === 'audio') return { accent: 'audio', extension, glyph: 'AUD', title: 'Audio', viewerKind }
  if (viewerKind === 'html') return { accent: 'html', extension, glyph: 'HTML', title: 'HTML', viewerKind }

  if (CODE_EXTENSIONS.has(extension)) {
    return { accent: 'code', extension, glyph: glyphFor(extension, 'CODE'), title: 'Code', viewerKind }
  }

  if (TEXT_EXTENSIONS.has(extension) || viewerKind === 'text') {
    return { accent: 'text', extension, glyph: glyphFor(extension, 'TXT'), title: 'Text', viewerKind }
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { accent: 'archive', extension, glyph: glyphFor(extension, 'ZIP'), title: 'Archive', viewerKind }
  }

  return { accent: 'file', extension, glyph: glyphFor(extension, 'FILE'), title: 'File', viewerKind }
}

export const viewerKindForFile = viewerKindForRemoteFile
