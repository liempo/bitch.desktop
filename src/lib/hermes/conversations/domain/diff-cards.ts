import { isAbsoluteRemoteFilePath } from '$lib/hermes/files'

export type DiffFileChangeKind = 'added' | 'binary' | 'deleted' | 'modified' | 'renamed' | 'unknown'
export type DiffLineKind = 'add' | 'context' | 'delete' | 'meta'

export interface DiffCardLine {
  content: string
  kind: DiffLineKind
  newLine: null | number
  oldLine: null | number
}

export interface DiffCardHunk {
  header: string
  lines: DiffCardLine[]
  newStart: null | number
  oldStart: null | number
}

export interface DiffCardFile {
  absolutePath?: string
  additions: number
  changeKind: DiffFileChangeKind
  deletions: number
  displayPath: string
  hunks: DiffCardHunk[]
  id: string
  metaLines: string[]
  newPath?: string
  oldPath?: string
  rawText: string
}

export interface DiffCard {
  files: DiffCardFile[]
  malformed: boolean
  rawText: string
}

export type DiffCardSegment = { text: string; type: 'markdown' } | { card: DiffCard; type: 'diff' }

interface MutableDiffFile {
  additions: number
  binary: boolean
  deleted: boolean
  hunks: DiffCardHunk[]
  metaLines: string[]
  newFile: boolean
  newPath?: string
  oldPath?: string
  rawLines: string[]
  renamed: boolean
}

const FENCED_DIFF_RE = /^```([^\n`]*)\n([\s\S]*?)^```[^\n]*$/gm

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim()
  const quote = trimmed[0]
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) return trimmed.slice(1, -1)
  return trimmed
}

function normalizeDiffPath(value: string): string {
  const withoutTimestamp = stripOuterQuotes(value.trim().split('\t', 1)[0] ?? '')
  if (!withoutTimestamp) return ''
  if (withoutTimestamp === '/dev/null') return withoutTimestamp
  if (/^[ab]\//.test(withoutTimestamp)) return withoutTimestamp.slice(2)
  return withoutTimestamp
}

function pathFromHeader(line: string, marker: '+++' | '---'): string {
  return normalizeDiffPath(line.slice(marker.length).trim())
}

function parseDiffGitPaths(line: string): { newPath?: string; oldPath?: string } {
  const rest = line.slice('diff --git'.length).trim()
  const bMarker = rest.lastIndexOf(' b/')
  if (bMarker > 0) {
    return {
      newPath: normalizeDiffPath(rest.slice(bMarker + 1)),
      oldPath: normalizeDiffPath(rest.slice(0, bMarker))
    }
  }

  const parts = rest.match(/(?:"[^"]+"|'[^']+'|\S+)/g) ?? []
  return {
    newPath: parts[1] ? normalizeDiffPath(parts[1]) : undefined,
    oldPath: parts[0] ? normalizeDiffPath(parts[0]) : undefined
  }
}

function parseBinaryPaths(line: string): { newPath?: string; oldPath?: string } {
  const match = line.match(/^Binary files (.+) and (.+) differ$/)
  if (!match) return {}
  return {
    newPath: normalizeDiffPath(match[2] ?? ''),
    oldPath: normalizeDiffPath(match[1] ?? '')
  }
}

function parseHunkHeader(line: string): { newStart: number; oldStart: number } | null {
  const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/)
  if (!match) return null
  return {
    newStart: Number.parseInt(match[2] ?? '0', 10),
    oldStart: Number.parseInt(match[1] ?? '0', 10)
  }
}

function createMutableFile(paths: { newPath?: string; oldPath?: string } = {}): MutableDiffFile {
  return {
    additions: 0,
    binary: false,
    deleted: false,
    hunks: [],
    metaLines: [],
    newFile: false,
    newPath: paths.newPath,
    oldPath: paths.oldPath,
    rawLines: [],
    renamed: false
  }
}

function displayPathForFile(file: MutableDiffFile): string {
  return file.newPath && file.newPath !== '/dev/null'
    ? file.newPath
    : file.oldPath && file.oldPath !== '/dev/null'
      ? file.oldPath
      : 'unknown file'
}

function changeKindForFile(file: MutableDiffFile): DiffFileChangeKind {
  if (file.binary) return 'binary'
  if (file.renamed) return 'renamed'
  if (file.deleted || file.newPath === '/dev/null') return 'deleted'
  if (file.newFile || file.oldPath === '/dev/null') return 'added'
  if (file.oldPath || file.newPath || file.hunks.length > 0) return 'modified'
  return 'unknown'
}

function absolutePathForFile(file: MutableDiffFile): string | undefined {
  const candidates = [file.newPath, file.oldPath].filter(
    (path): path is string => Boolean(path) && path !== '/dev/null'
  )
  return candidates.find(isAbsoluteRemoteFilePath)
}

function toDiffFile(file: MutableDiffFile, index: number): DiffCardFile | null {
  const displayPath = displayPathForFile(file)
  if (displayPath === 'unknown file' && file.hunks.length === 0 && file.rawLines.length === 0) return null

  return {
    additions: file.additions,
    changeKind: changeKindForFile(file),
    deletions: file.hunks.reduce((count, hunk) => count + hunk.lines.filter(line => line.kind === 'delete').length, 0),
    displayPath,
    hunks: file.hunks,
    id: `${displayPath}:${index}`,
    metaLines: file.metaLines,
    ...(file.newPath ? { newPath: file.newPath } : {}),
    ...(file.oldPath ? { oldPath: file.oldPath } : {}),
    ...(absolutePathForFile(file) ? { absolutePath: absolutePathForFile(file) } : {}),
    rawText: file.rawLines.join('\n')
  }
}

function pushRawLine(file: MutableDiffFile | null, line: string): void {
  file?.rawLines.push(line)
}

function pushMetaLine(file: MutableDiffFile | null, line: string): void {
  if (!file) return
  file.metaLines.push(line)
  file.rawLines.push(line)
}

function hasDiffSignal(value: string): boolean {
  return /(^|\n)(diff --git\s|Index:\s|---\s|\+\+\+\s|@@\s)/.test(value)
}

function looksLikeStandaloneDiff(value: string): boolean {
  const firstLine = normalizeNewlines(value)
    .split('\n')
    .find(line => line.trim().length > 0)
    ?.trim()
  return Boolean(firstLine?.match(/^(diff --git\s|Index:\s|---\s|Binary files\s)/))
}

function isDiffFenceLanguage(language: string): boolean {
  return /^(diff|patch|udiff)(\s|$)/i.test(language.trim())
}

export function parseDiffCards(rawText: string): DiffCard {
  const text = normalizeNewlines(rawText)
  const lines = text.split('\n')
  const files: DiffCardFile[] = []
  let current: MutableDiffFile | null = null
  let currentHunk: DiffCardHunk | null = null
  let nextOldLine: null | number = null
  let nextNewLine: null | number = null
  let malformed = false

  function finishCurrent(): void {
    if (!current) return
    const file = toDiffFile(current, files.length)
    if (
      file &&
      (file.oldPath || file.newPath || file.hunks.length > 0 || current.binary || file.metaLines.length > 0)
    ) {
      files.push(file)
    }
    current = null
    currentHunk = null
    nextOldLine = null
    nextNewLine = null
  }

  function startFile(paths: { newPath?: string; oldPath?: string } = {}): MutableDiffFile {
    finishCurrent()
    current = createMutableFile(paths)
    return current
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      current = startFile(parseDiffGitPaths(line))
      pushRawLine(current, line)
      continue
    }

    if (line.startsWith('Index: ')) {
      current = startFile({
        newPath: normalizeDiffPath(line.slice('Index: '.length)),
        oldPath: normalizeDiffPath(line.slice('Index: '.length))
      })
      pushRawLine(current, line)
      continue
    }

    if (line.startsWith('--- ')) {
      if (!current) current = startFile()
      current.oldPath = pathFromHeader(line, '---')
      pushRawLine(current, line)
      continue
    }

    if (line.startsWith('+++ ')) {
      if (!current) current = startFile()
      current.newPath = pathFromHeader(line, '+++')
      pushRawLine(current, line)
      continue
    }

    if (line.startsWith('Binary files ')) {
      if (!current) current = startFile(parseBinaryPaths(line))
      const binaryPaths = parseBinaryPaths(line)
      current.oldPath ||= binaryPaths.oldPath
      current.newPath ||= binaryPaths.newPath
      current.binary = true
      pushMetaLine(current, line)
      continue
    }

    const hunkHeader = parseHunkHeader(line)
    if (hunkHeader) {
      if (!current) {
        malformed = true
        continue
      }
      currentHunk = { header: line, lines: [], newStart: hunkHeader.newStart, oldStart: hunkHeader.oldStart }
      current.hunks.push(currentHunk)
      current.rawLines.push(line)
      nextOldLine = hunkHeader.oldStart
      nextNewLine = hunkHeader.newStart
      continue
    }

    if (current && line.startsWith('new file mode ')) {
      current.newFile = true
      pushMetaLine(current, line)
      continue
    }

    if (current && line.startsWith('deleted file mode ')) {
      current.deleted = true
      pushMetaLine(current, line)
      continue
    }

    if (current && line.startsWith('rename from ')) {
      current.renamed = true
      current.oldPath = normalizeDiffPath(line.slice('rename from '.length))
      pushMetaLine(current, line)
      continue
    }

    if (current && line.startsWith('rename to ')) {
      current.renamed = true
      current.newPath = normalizeDiffPath(line.slice('rename to '.length))
      pushMetaLine(current, line)
      continue
    }

    if (
      current &&
      (line.startsWith('index ') ||
        line.startsWith('similarity index ') ||
        line.startsWith('dissimilarity index ') ||
        line.startsWith('old mode ') ||
        line.startsWith('new mode '))
    ) {
      pushMetaLine(current, line)
      continue
    }

    if (!current || !currentHunk) {
      if (line.trim()) malformed ||= hasDiffSignal(line)
      continue
    }

    current.rawLines.push(line)

    if (line.startsWith('\\ No newline at end of file')) {
      currentHunk.lines.push({ content: line, kind: 'meta', newLine: null, oldLine: null })
      continue
    }

    if (line.startsWith('+')) {
      current.additions += 1
      currentHunk.lines.push({ content: line, kind: 'add', newLine: nextNewLine, oldLine: null })
      if (nextNewLine !== null) nextNewLine += 1
      continue
    }

    if (line.startsWith('-')) {
      currentHunk.lines.push({ content: line, kind: 'delete', newLine: null, oldLine: nextOldLine })
      if (nextOldLine !== null) nextOldLine += 1
      continue
    }

    currentHunk.lines.push({ content: line, kind: 'context', newLine: nextNewLine, oldLine: nextOldLine })
    if (nextOldLine !== null) nextOldLine += 1
    if (nextNewLine !== null) nextNewLine += 1
  }

  finishCurrent()

  return {
    files,
    malformed: malformed || (files.length === 0 && hasDiffSignal(text)),
    rawText: text
  }
}

export function extractDiffCardSegments(rawText: string): DiffCardSegment[] {
  const text = normalizeNewlines(rawText)
  const standaloneCard = parseDiffCards(text)
  if (standaloneCard.files.length > 0 && looksLikeStandaloneDiff(text)) return [{ card: standaloneCard, type: 'diff' }]

  const segments: DiffCardSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(FENCED_DIFF_RE)) {
    const [fullMatch, language = '', body = ''] = match
    if (match.index === undefined) continue

    const card = isDiffFenceLanguage(language) ? parseDiffCards(body) : null
    if (!card || card.files.length === 0) continue

    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), type: 'markdown' })
    segments.push({ card, type: 'diff' })
    cursor = match.index + fullMatch.length
  }

  if (segments.length === 0) return [{ text, type: 'markdown' }]
  if (cursor < text.length) segments.push({ text: text.slice(cursor), type: 'markdown' })
  return segments.filter(segment => segment.type === 'diff' || segment.text.length > 0)
}
