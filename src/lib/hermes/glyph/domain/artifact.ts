import {
  GLYPH_CANONICAL_SIZE_PX,
  GLYPH_SCHEMA_VERSION,
  GLYPH_TARGET_SCENE_BOX,
  type GlyphArtifact,
  type GlyphManifest,
  type GlyphSceneSpec,
  type RawGlyphArtifactResponse
} from './types'
import { normalizeGlyphScene } from './scene'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function dataUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^data:image\/(?:avif|bmp|gif|jpeg|jpg|png|svg\+xml|webp);base64,/i.test(trimmed) ? trimmed : undefined
}

export function normalizeGlyphManifest(value: unknown, scene?: GlyphSceneSpec): GlyphManifest | null {
  const record = asRecord(value) ?? {}
  const schemaVersion = record.schemaVersion ?? record.schema_version ?? GLYPH_SCHEMA_VERSION
  const kind = stringValue(record.kind, 'bitch.glyph')

  if (schemaVersion !== GLYPH_SCHEMA_VERSION || kind !== 'bitch.glyph') return null

  return {
    canonicalSizePx: numberValue(record.canonicalSizePx ?? record.canonical_size_px, GLYPH_CANONICAL_SIZE_PX),
    createdAt: stringValue(record.createdAt ?? record.created_at) || undefined,
    kind: 'bitch.glyph',
    name: stringValue(record.name, 'Personal glyph'),
    preview: stringValue(record.preview, 'preview.png'),
    prompt: stringValue(record.prompt) || undefined,
    scene: stringValue(record.scene, 'glyph.scene.json'),
    sceneBox: numberValue(record.sceneBox ?? record.scene_box, scene?.sceneBox ?? GLYPH_TARGET_SCENE_BOX),
    schemaVersion: GLYPH_SCHEMA_VERSION
  }
}

function sceneCandidate(record: Record<string, unknown>): unknown {
  return record.scene ?? record.scene_json ?? record.glyphScene ?? record.glyph_scene
}

export function normalizeGlyphArtifact(value: unknown): GlyphArtifact | null {
  const record = asRecord(value)
  if (!record) return null

  const scene = normalizeGlyphScene(sceneCandidate(record))
  if (!scene) return null

  const manifest = normalizeGlyphManifest(record.manifest ?? record, scene)
  if (!manifest) return null

  const raw = record as RawGlyphArtifactResponse

  return {
    manifest,
    previewDataUrl: dataUrl(raw.previewDataUrl ?? raw.preview_data_url),
    scene
  }
}

export function parseStoredGlyphArtifact(value: null | string): GlyphArtifact | null {
  if (!value) return null

  try {
    return normalizeGlyphArtifact(JSON.parse(value))
  } catch {
    return null
  }
}

export function serializeGlyphArtifact(artifact: GlyphArtifact): string {
  return JSON.stringify(artifact)
}
