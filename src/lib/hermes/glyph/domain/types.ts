export const GLYPH_SCHEMA_VERSION = 1
export const GLYPH_CANONICAL_SIZE_PX = 512
export const GLYPH_TARGET_SCENE_BOX = 3.2

export type GlyphShapeKind = 'box' | 'icosahedron' | 'octahedron' | 'ring' | 'sphere' | 'tetrahedron' | 'torus'
export type GlyphRenderMode = 'edges' | 'solid' | 'wireframe'
export type GlyphTelemetrySignal = 'cpu' | 'memory'
export type GlyphVector3 = [number, number, number]
export type GlyphScale = GlyphVector3 | number

export interface GlyphSceneObjectSpec {
  color?: string
  depth?: number
  detail?: number
  height?: number
  id?: string
  innerRadius?: number
  mode?: GlyphRenderMode
  opacity?: number
  outerRadius?: number
  position?: GlyphVector3
  radius?: number
  rotation?: GlyphVector3
  scale?: GlyphScale
  segments?: number
  telemetry?: GlyphTelemetrySpec
  tube?: number
  type: GlyphShapeKind
  width?: number
}

export interface GlyphTelemetrySpec {
  opacity?: GlyphTelemetrySignal
  scale?: GlyphTelemetrySignal
}

export interface GlyphSceneAnimationSpec {
  rotation?: GlyphVector3
  speed?: number
  telemetryBoost?: GlyphTelemetrySignal
}

export interface GlyphSceneCameraSpec {
  fov?: number
  z?: number
}

export interface GlyphSceneSpec {
  animation?: GlyphSceneAnimationSpec
  camera?: GlyphSceneCameraSpec
  objects: GlyphSceneObjectSpec[]
  sceneBox?: number
  schemaVersion: typeof GLYPH_SCHEMA_VERSION
}

export interface GlyphManifest {
  canonicalSizePx?: number
  createdAt?: string
  kind: 'bitch.glyph'
  name: string
  prompt?: string
  preview?: string
  scene?: string
  sceneBox?: number
  schemaVersion: typeof GLYPH_SCHEMA_VERSION
}

export interface GlyphArtifact {
  manifest: GlyphManifest
  previewDataUrl?: string
  scene: GlyphSceneSpec
}

export interface RawGlyphArtifactResponse {
  manifest?: unknown
  previewDataUrl?: unknown
  preview_data_url?: unknown
  scene?: unknown
  scene_json?: unknown
}
