import { messageForError } from '$lib/errors'
import { normalizeProfileKey, profileState } from '$lib/hermes/profiles'
import { resetDynamicAppIcon, setDynamicAppIconFromDataUrl } from '$lib/platform'
import {
  readNamespacedStorageItem,
  removeNamespacedStorageItem,
  writeNamespacedStorageItem
} from '$lib/storage/namespace'

import { generateGlyphArtifact, getCurrentGlyphArtifact, listGlyphArtifacts } from '../adapters/dashboard-glyph-adapter'
import {
  normalizeGlyphArtifact,
  normalizeGlyphGenerationResult,
  normalizeGlyphListResult,
  parseStoredGlyphArtifact,
  serializeGlyphArtifact
} from '../domain/artifact'
import type { GlyphArtifact, GlyphListItem, GlyphManifest, GlyphSceneSpec } from '../domain/types'

const GLYPH_ARTIFACT_STORAGE_SUFFIX = 'glyph.artifact'

export interface GlyphState {
  artifact: GlyphArtifact | null
  currentGlyphId: null | string
  error: null | string
  generating: boolean
  glyphs: GlyphListItem[]
  glyphsLoading: boolean
  initialized: boolean
  lastPrompt: string
  manifest: GlyphManifest | null
  notice: null | string
  previewDataUrl: null | string
  scene: GlyphSceneSpec | null
  selectedGlyphId: null | string
  syncing: boolean
}

export const glyphState = $state<GlyphState>({
  artifact: null,
  currentGlyphId: null,
  error: null,
  generating: false,
  glyphs: [],
  glyphsLoading: false,
  initialized: false,
  lastPrompt: '',
  manifest: null,
  notice: null,
  previewDataUrl: null,
  scene: null,
  selectedGlyphId: null,
  syncing: false
})

function artifactGlyphId(artifact: GlyphArtifact | null): null | string {
  return artifact?.id ?? artifact?.manifest.id ?? null
}

function targetProfileFor(profile?: null | string): string {
  return normalizeProfileKey(profile ?? profileState.activeGatewayProfile)
}

function setArtifact(artifact: GlyphArtifact | null): void {
  glyphState.artifact = artifact
  glyphState.manifest = artifact?.manifest ?? null
  glyphState.previewDataUrl = artifact?.previewDataUrl ?? null
  glyphState.scene = artifact?.scene ?? null
  glyphState.selectedGlyphId = artifactGlyphId(artifact)
}

async function updateDynamicAppIcon(artifact: GlyphArtifact): Promise<boolean> {
  return setDynamicAppIconFromDataUrl(artifact.previewDataUrl)
}

function restoreDynamicAppIcon(artifact: GlyphArtifact): void {
  if (!artifact.previewDataUrl) return
  void updateDynamicAppIcon(artifact).catch(() => undefined)
}

async function applyBuiltInFallback(notice: string): Promise<void> {
  setArtifact(null)
  removeNamespacedStorageItem(GLYPH_ARTIFACT_STORAGE_SUFFIX)
  glyphState.notice = notice

  try {
    await resetDynamicAppIcon()
  } catch (error) {
    glyphState.error = `${notice} The macOS app icon did not reset: ${messageForError(error)}`
  }
}

function isGlyphNotFoundError(error: unknown): boolean {
  const message = messageForError(error)
  return /\b404\b/.test(message) || /glyph (?:artifact |id )?not found/i.test(message)
}

async function updateGlyphAppIconNotice(
  artifact: GlyphArtifact,
  verb: 'Generated' | 'Selected' | 'Synced'
): Promise<void> {
  try {
    const iconUpdated = await updateDynamicAppIcon(artifact)
    glyphState.notice = iconUpdated
      ? `${verb} ${artifact.manifest.name} and updated the macOS app icon.`
      : `${verb} ${artifact.manifest.name}. Add preview.png to update the macOS app icon.`
  } catch (error) {
    glyphState.error = `${verb} ${artifact.manifest.name}, but the macOS app icon did not update: ${messageForError(error)}`
    glyphState.notice = `${verb} ${artifact.manifest.name}.`
  }
}

export function initializeGlyphState(): void {
  if (glyphState.initialized) return

  glyphState.initialized = true
  const stored = parseStoredGlyphArtifact(readNamespacedStorageItem(GLYPH_ARTIFACT_STORAGE_SUFFIX))

  if (stored) {
    setArtifact(stored)
    restoreDynamicAppIcon(stored)
  }
}

export function applyGlyphArtifact(rawArtifact: unknown): GlyphArtifact {
  const artifact = normalizeGlyphArtifact(rawArtifact)

  if (!artifact) {
    throw new Error('Glyph artifact did not match the BITCH glyph schema')
  }

  setArtifact(artifact)
  writeNamespacedStorageItem(GLYPH_ARTIFACT_STORAGE_SUFFIX, serializeGlyphArtifact(artifact))
  glyphState.error = null
  glyphState.notice = `Loaded glyph: ${artifact.manifest.name}`

  return artifact
}

export function clearPersonalGlyph(): void {
  glyphState.error = null
  void applyBuiltInFallback('Personal glyph reset to the built-in fallback.')
}

export async function loadGlyphList(profile?: null | string): Promise<boolean> {
  glyphState.glyphsLoading = true

  try {
    const targetProfile = targetProfileFor(profile)
    const result = normalizeGlyphListResult(await listGlyphArtifacts(targetProfile))
    glyphState.glyphs = result.glyphs
    glyphState.currentGlyphId = result.currentId ?? null
    return true
  } catch (error) {
    glyphState.error = messageForError(error)
    return false
  } finally {
    glyphState.glyphsLoading = false
  }
}

export async function syncRemoteGlyphArtifact(profile?: null | string, glyphId?: null | string): Promise<boolean> {
  const requestedId = glyphId?.trim() || null
  glyphState.syncing = true
  glyphState.error = null
  glyphState.notice = null

  try {
    const targetProfile = targetProfileFor(profile)
    const artifact = applyGlyphArtifact(await getCurrentGlyphArtifact(targetProfile, requestedId))
    await updateGlyphAppIconNotice(artifact, requestedId ? 'Selected' : 'Synced')
    return true
  } catch (error) {
    if (requestedId && isGlyphNotFoundError(error)) {
      await applyBuiltInFallback(`Glyph ${requestedId} was not found; using the built-in fallback.`)
      return false
    }

    glyphState.error = messageForError(error)
    return false
  } finally {
    glyphState.syncing = false
  }
}

export function selectRemoteGlyphArtifact(glyphId: string, profile?: null | string): Promise<boolean> {
  return syncRemoteGlyphArtifact(profile, glyphId)
}

export async function requestGlyphGeneration(glyphPrompt: string, profile?: null | string): Promise<boolean> {
  const prompt = glyphPrompt.trim()

  if (!prompt) {
    glyphState.error = 'Describe the glyph before generating it.'
    return false
  }

  glyphState.generating = true
  glyphState.error = null
  glyphState.notice = null

  try {
    const targetProfile = targetProfileFor(profile)
    const result = normalizeGlyphGenerationResult(await generateGlyphArtifact(prompt, targetProfile))

    if (!result) {
      glyphState.error = 'Hermes glyph plugin did not return a generated glyph id.'
      return false
    }

    glyphState.lastPrompt = prompt
    const artifact = applyGlyphArtifact(await getCurrentGlyphArtifact(targetProfile, result.id))
    await updateGlyphAppIconNotice(artifact, 'Generated')
    void loadGlyphList(targetProfile)
    return true
  } catch (error) {
    glyphState.error = messageForError(error)
    return false
  } finally {
    glyphState.generating = false
  }
}
