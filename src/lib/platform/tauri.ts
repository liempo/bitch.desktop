import { invoke } from '@tauri-apps/api/core'
import { listen, type Event as TauriEvent, type UnlistenFn } from '@tauri-apps/api/event'

export type { TauriEvent, UnlistenFn }

type TauriCommandArgs = Record<string, unknown> | undefined

const DYNAMIC_APP_ICON_SIZE = 1024
const MACOS_APP_ICON_ARTWORK_SCALE = 0.64
const MACOS_APP_ICON_BACKGROUND = '#000000'
const MACOS_APP_ICON_FRAME = '#273049'
const MACOS_APP_ICON_FRAME_MUTED = '#111827'
const MACOS_APP_ICON_INNER_FRAME = {
  inset: 144,
  radius: 144,
  size: 736,
  strokeWidth: 2
}
const MACOS_APP_ICON_OUTER_FRAME = {
  inset: 120,
  radius: 166,
  size: 784,
  strokeWidth: 4
}
const MACOS_APP_ICON_PLATE = {
  inset: 96,
  radius: 184,
  shadowTop: 116,
  size: 832
}
const PNG_DATA_URL_PATTERN = /^data:image\/png;base64,/i

export function invokeTauriCommand<T>(command: string, args?: TauriCommandArgs): Promise<T> {
  return invoke<T>(command, args)
}

export function listenTauriEvent<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<UnlistenFn> {
  return listen<T>(event, handler)
}

export function openExternalUrl(url: string): Promise<void> {
  return invokeTauriCommand<void>('open_external_url', { url })
}

function loadPngDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not decode dynamic app icon PNG data URL'))
    image.src = dataUrl
  })
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('Could not render dynamic app icon PNG'))
    }, 'image/png')
  })
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  options: { alpha?: number; color: string; radius: number; size: number; x: number; y: number }
): void {
  context.save()
  context.globalAlpha = options.alpha ?? 1
  context.fillStyle = options.color
  roundedRectPath(context, options.x, options.y, options.size, options.size, options.radius)
  context.fill()
  context.restore()
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  options: { alpha?: number; color: string; radius: number; size: number; strokeWidth: number; x: number; y: number }
): void {
  context.save()
  context.globalAlpha = options.alpha ?? 1
  context.lineWidth = options.strokeWidth
  context.strokeStyle = options.color
  roundedRectPath(context, options.x, options.y, options.size, options.size, options.radius)
  context.stroke()
  context.restore()
}

function drawMacOsAppIconPlate(context: CanvasRenderingContext2D): void {
  fillRoundedRect(context, {
    alpha: 0.34,
    color: MACOS_APP_ICON_BACKGROUND,
    radius: MACOS_APP_ICON_PLATE.radius,
    size: MACOS_APP_ICON_PLATE.size,
    x: MACOS_APP_ICON_PLATE.inset,
    y: MACOS_APP_ICON_PLATE.shadowTop
  })
  fillRoundedRect(context, {
    color: MACOS_APP_ICON_BACKGROUND,
    radius: MACOS_APP_ICON_PLATE.radius,
    size: MACOS_APP_ICON_PLATE.size,
    x: MACOS_APP_ICON_PLATE.inset,
    y: MACOS_APP_ICON_PLATE.inset
  })
}

function drawMacOsAppIconFrame(context: CanvasRenderingContext2D): void {
  strokeRoundedRect(context, {
    alpha: 0.82,
    color: MACOS_APP_ICON_FRAME,
    radius: MACOS_APP_ICON_OUTER_FRAME.radius,
    size: MACOS_APP_ICON_OUTER_FRAME.size,
    strokeWidth: MACOS_APP_ICON_OUTER_FRAME.strokeWidth,
    x: MACOS_APP_ICON_OUTER_FRAME.inset,
    y: MACOS_APP_ICON_OUTER_FRAME.inset
  })
  strokeRoundedRect(context, {
    alpha: 0.88,
    color: MACOS_APP_ICON_FRAME_MUTED,
    radius: MACOS_APP_ICON_INNER_FRAME.radius,
    size: MACOS_APP_ICON_INNER_FRAME.size,
    strokeWidth: MACOS_APP_ICON_INNER_FRAME.strokeWidth,
    x: MACOS_APP_ICON_INNER_FRAME.inset,
    y: MACOS_APP_ICON_INNER_FRAME.inset
  })
}

function drawMacOsAppIconArtwork(context: CanvasRenderingContext2D, image: HTMLImageElement): void {
  const sourceWidth = image.naturalWidth || DYNAMIC_APP_ICON_SIZE
  const sourceHeight = image.naturalHeight || DYNAMIC_APP_ICON_SIZE
  const maxArtworkSize = DYNAMIC_APP_ICON_SIZE * MACOS_APP_ICON_ARTWORK_SCALE
  const scale = Math.min(maxArtworkSize / sourceWidth, maxArtworkSize / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale

  context.save()
  roundedRectPath(
    context,
    MACOS_APP_ICON_PLATE.inset,
    MACOS_APP_ICON_PLATE.inset,
    MACOS_APP_ICON_PLATE.size,
    MACOS_APP_ICON_PLATE.size,
    MACOS_APP_ICON_PLATE.radius
  )
  context.clip()
  context.drawImage(
    image,
    (DYNAMIC_APP_ICON_SIZE - drawWidth) / 2,
    (DYNAMIC_APP_ICON_SIZE - drawHeight) / 2,
    drawWidth,
    drawHeight
  )
  context.restore()
}

async function macOsAppIconDataUrlToBytes(dataUrl: string): Promise<number[]> {
  const image = await loadPngDataUrl(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = DYNAMIC_APP_ICON_SIZE
  canvas.height = DYNAMIC_APP_ICON_SIZE

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create dynamic app icon canvas')

  drawMacOsAppIconPlate(context)
  drawMacOsAppIconArtwork(context, image)
  drawMacOsAppIconFrame(context)

  const blob = await canvasToPngBlob(canvas)
  const buffer = await blob.arrayBuffer()
  return Array.from(new Uint8Array(buffer))
}

export async function setDynamicAppIconFromDataUrl(dataUrl?: null | string): Promise<boolean> {
  const iconDataUrl = dataUrl?.trim()
  if (!iconDataUrl || !PNG_DATA_URL_PATTERN.test(iconDataUrl)) return false

  const pngBytes = await macOsAppIconDataUrlToBytes(iconDataUrl)
  await invokeTauriCommand<void>('set_dynamic_app_icon', { pngBytes })
  return true
}

export function resetDynamicAppIcon(): Promise<void> {
  return invokeTauriCommand<void>('reset_dynamic_app_icon')
}
