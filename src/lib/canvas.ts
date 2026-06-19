import { filePathFromRemoteSource, isAbsoluteRemoteFilePath, remoteFileLabel } from '$lib/remote-files'

export interface ThreadCanvas {
  error?: string
  label: string
  path?: string
  source: string
  url: null | string
}

export interface CanvasExtractionResult {
  canvases: ThreadCanvas[]
  cleanedText: string
  latestCanvas: null | ThreadCanvas
}

const CANVAS_LINE_RE = /(^|\n)[\t ]*[`"']?CANVAS:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|[^\n]+)[`"']?[\t ]*(\n|$)/gi
const CANVAS_TAG_RE = /[`"']?CANVAS:\s*(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)[`"']?/gi

function unquoteCanvasRef(value: string): string {
  const trimmed = value.trim()
  const head = trimmed[0]
  const tail = trimmed[trimmed.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  return (quoted ? trimmed.slice(1, -1) : trimmed).replace(/[),.;!?]+$/, '').trim()
}

function remoteCanvasUrl(source: string): string | null {
  const trimmed = source.trim()

  if (!/^https?:/i.test(trimmed)) return null

  try {
    return new URL(trimmed).toString()
  } catch {
    return null
  }
}

function canvasPath(source: string): string | undefined {
  if (/^https?:/i.test(source.trim())) return undefined
  const path = filePathFromRemoteSource(source)
  return path || undefined
}

export function canvasFromSource(rawSource: string): ThreadCanvas | null {
  const source = unquoteCanvasRef(rawSource)
  if (!source) return null

  const path = canvasPath(source)
  const url = remoteCanvasUrl(source)
  const canvas: ThreadCanvas = {
    label: remoteFileLabel(source) || 'canvas.html',
    source,
    url
  }

  if (path) canvas.path = path

  if (!url && path && !isAbsoluteRemoteFilePath(path)) {
    canvas.error = 'Canvas file previews require an absolute path visible to the remote Hermes environment.'
  }

  return canvas
}

export function extractCanvasReferences(text: string): CanvasExtractionResult {
  const canvases: ThreadCanvas[] = []
  const rememberCanvas = (rawSource: string): void => {
    const canvas = canvasFromSource(rawSource)
    if (canvas) canvases.push(canvas)
  }

  const cleanedText = text
    .replace(CANVAS_LINE_RE, (_match, lead: string, rawSource: string, trailer: string) => {
      rememberCanvas(rawSource)
      return `${lead}${trailer}`
    })
    .replace(CANVAS_TAG_RE, (_match, rawSource: string) => {
      rememberCanvas(rawSource)
      return ''
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    canvases,
    cleanedText,
    latestCanvas: canvases.at(-1) ?? null
  }
}
