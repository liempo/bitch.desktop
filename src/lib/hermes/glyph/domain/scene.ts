import {
  GLYPH_SCHEMA_VERSION,
  GLYPH_TARGET_SCENE_BOX,
  type GlyphRenderMode,
  type GlyphScale,
  type GlyphSceneAnimationSpec,
  type GlyphSceneCameraSpec,
  type GlyphSceneObjectSpec,
  type GlyphSceneSpec,
  type GlyphShapeKind,
  type GlyphTelemetrySignal,
  type GlyphTelemetrySpec,
  type GlyphVector3
} from './types'

const SHAPE_KINDS = new Set<GlyphShapeKind>([
  'box',
  'icosahedron',
  'octahedron',
  'ring',
  'sphere',
  'tetrahedron',
  'torus'
])
const RENDER_MODES = new Set<GlyphRenderMode>(['edges', 'solid', 'wireframe'])
const TELEMETRY_SIGNALS = new Set<GlyphTelemetrySignal>(['cpu', 'memory'])
const COLOR_TOKENS = new Set(['foreground', 'line', 'muted', 'primary'])
const MAX_OBJECTS = 32

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function numberInRange(value: unknown, fallback: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function integerInRange(value: unknown, fallback: number | undefined, min: number, max: number): number | undefined {
  const numeric = numberInRange(value, fallback, min, max)
  return numeric == null ? undefined : Math.round(numeric)
}

function stringValue(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function normalizeVector3(value: unknown, min = -12, max = 12): GlyphVector3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined
  const next = value.map(item => numberInRange(item, undefined, min, max))
  if (next.some(item => item == null)) return undefined
  return next as GlyphVector3
}

function normalizeScale(value: unknown): GlyphScale | undefined {
  if (typeof value === 'number') return numberInRange(value, undefined, 0.05, 8)
  return normalizeVector3(value, 0.05, 8)
}

function normalizeColor(value: unknown): string | undefined {
  const color = stringValue(value, 48)
  if (!color) return undefined
  if (COLOR_TOKENS.has(color)) return color
  if (/^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(color)) return color
  return undefined
}

function normalizeMode(value: unknown): GlyphRenderMode | undefined {
  return typeof value === 'string' && RENDER_MODES.has(value as GlyphRenderMode)
    ? (value as GlyphRenderMode)
    : undefined
}

function normalizeTelemetrySignal(value: unknown): GlyphTelemetrySignal | undefined {
  return typeof value === 'string' && TELEMETRY_SIGNALS.has(value as GlyphTelemetrySignal)
    ? (value as GlyphTelemetrySignal)
    : undefined
}

function normalizeTelemetry(value: unknown): GlyphTelemetrySpec | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const telemetry: GlyphTelemetrySpec = {
    opacity: normalizeTelemetrySignal(record.opacity),
    scale: normalizeTelemetrySignal(record.scale)
  }

  return telemetry.opacity || telemetry.scale ? telemetry : undefined
}

function normalizeObject(value: unknown): GlyphSceneObjectSpec | null {
  const record = asRecord(value)
  if (!record) return null

  const type =
    typeof record.type === 'string' && SHAPE_KINDS.has(record.type as GlyphShapeKind)
      ? (record.type as GlyphShapeKind)
      : null
  if (!type) return null

  const object: GlyphSceneObjectSpec = {
    type,
    color: normalizeColor(record.color) ?? 'foreground',
    depth: numberInRange(record.depth, undefined, 0.05, 10),
    detail: integerInRange(record.detail, undefined, 0, 5),
    height: numberInRange(record.height, undefined, 0.05, 10),
    id: stringValue(record.id, 64),
    innerRadius: numberInRange(record.innerRadius ?? record.inner_radius, undefined, 0.01, 8),
    mode: normalizeMode(record.mode) ?? 'edges',
    opacity: numberInRange(record.opacity, undefined, 0, 1),
    outerRadius: numberInRange(record.outerRadius ?? record.outer_radius, undefined, 0.02, 8),
    position: normalizeVector3(record.position),
    radius: numberInRange(record.radius, undefined, 0.02, 8),
    rotation: normalizeVector3(record.rotation, -64, 64),
    scale: normalizeScale(record.scale),
    segments: integerInRange(record.segments, undefined, 3, 96),
    telemetry: normalizeTelemetry(record.telemetry),
    tube: numberInRange(record.tube, undefined, 0.005, 2),
    width: numberInRange(record.width, undefined, 0.05, 10)
  }

  return Object.fromEntries(Object.entries(object).filter(([, entry]) => entry !== undefined)) as GlyphSceneObjectSpec
}

function normalizeAnimation(value: unknown): GlyphSceneAnimationSpec | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const animation: GlyphSceneAnimationSpec = {
    rotation: normalizeVector3(record.rotation, -4, 4),
    speed: numberInRange(record.speed, undefined, 0, 4),
    telemetryBoost: normalizeTelemetrySignal(record.telemetryBoost ?? record.telemetry_boost)
  }

  return animation.rotation || animation.speed != null || animation.telemetryBoost ? animation : undefined
}

function normalizeCamera(value: unknown): GlyphSceneCameraSpec | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const camera: GlyphSceneCameraSpec = {
    fov: numberInRange(record.fov, undefined, 20, 75),
    z: numberInRange(record.z, undefined, 3, 12)
  }

  return camera.fov != null || camera.z != null ? camera : undefined
}

export function normalizeGlyphScene(value: unknown): GlyphSceneSpec | null {
  const record = asRecord(value)
  if (!record) return null

  if (record.schemaVersion !== GLYPH_SCHEMA_VERSION && record.schema_version !== GLYPH_SCHEMA_VERSION) return null

  const objects = Array.isArray(record.objects)
    ? record.objects
        .map(normalizeObject)
        .filter((object): object is GlyphSceneObjectSpec => Boolean(object))
        .slice(0, MAX_OBJECTS)
    : []

  if (!objects.length) return null

  return {
    animation: normalizeAnimation(record.animation),
    camera: normalizeCamera(record.camera),
    objects,
    sceneBox: numberInRange(record.sceneBox ?? record.scene_box, GLYPH_TARGET_SCENE_BOX, 1, 6),
    schemaVersion: GLYPH_SCHEMA_VERSION
  }
}
