import { boxUrlForAgentPath } from '$lib/box'

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

  return (quoted ? trimmed.slice(1, -1) : trimmed).replace(/[,.;!?]+$/, '').trim()
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function sourcePath(source: string): string {
  const trimmed = source.trim()

  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname)
    } catch {
      return trimmed.replace(/^file:\/\//, '')
    }
  }

  if (/^https?:/i.test(trimmed)) {
    try {
      return new URL(trimmed).pathname
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function labelFromSource(source: string): string {
  const path = sourcePath(source).split(/[?#]/, 1)[0] ?? ''
  const label = path.split(/[\\/]/).filter(Boolean).pop()

  return label ? safeDecodeURIComponent(label) : 'canvas.html'
}

function canvasPath(source: string): string | undefined {
  if (/^https?:/i.test(source.trim())) return undefined
  return sourcePath(source)
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

export function canvasFromSource(rawSource: string): ThreadCanvas | null {
  const source = unquoteCanvasRef(rawSource)
  if (!source) return null

  const path = canvasPath(source)
  const boxUrl = boxUrlForAgentPath(source)
  const remoteUrl = remoteCanvasUrl(source)
  const url = boxUrl ?? remoteUrl
  const canvas: ThreadCanvas = {
    label: labelFromSource(source),
    source,
    url
  }

  if (path) {
    canvas.path = path
  }

  if (!url) {
    canvas.error = sourcePath(source).startsWith('/box')
      ? 'VITE_BOX_BASE_URL is not configured. Declare it in .env to render this canvas.'
      : 'Canvas sources must be HTTP(S) URLs or agent-visible /box paths served by BOX.'
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
