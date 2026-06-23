import { messageForError } from '$lib/errors'
import { submitPrompt } from '$lib/hermes/composer'
import { normalizeProfileKey, profileState } from '$lib/hermes/profiles'
import {
  readNamespacedStorageItem,
  removeNamespacedStorageItem,
  writeNamespacedStorageItem
} from '$lib/storage/namespace'

import { getCurrentGlyphArtifact } from '../adapters/dashboard-glyph-adapter'
import { normalizeGlyphArtifact, parseStoredGlyphArtifact, serializeGlyphArtifact } from '../domain/artifact'
import { buildGlyphSkillPrompt } from '../domain/skill-prompt'
import type { GlyphArtifact, GlyphManifest, GlyphSceneSpec } from '../domain/types'

const GLYPH_ARTIFACT_STORAGE_SUFFIX = 'glyph.artifact'

export interface GlyphState {
  artifact: GlyphArtifact | null
  error: null | string
  generating: boolean
  initialized: boolean
  lastPrompt: string
  manifest: GlyphManifest | null
  notice: null | string
  previewDataUrl: null | string
  scene: GlyphSceneSpec | null
  syncing: boolean
}

export interface GlyphGenerationOptions {
  sessionId?: null | string
}

export const glyphState = $state<GlyphState>({
  artifact: null,
  error: null,
  generating: false,
  initialized: false,
  lastPrompt: '',
  manifest: null,
  notice: null,
  previewDataUrl: null,
  scene: null,
  syncing: false
})

function setArtifact(artifact: GlyphArtifact | null): void {
  glyphState.artifact = artifact
  glyphState.manifest = artifact?.manifest ?? null
  glyphState.previewDataUrl = artifact?.previewDataUrl ?? null
  glyphState.scene = artifact?.scene ?? null
}

export function initializeGlyphState(): void {
  if (glyphState.initialized) return

  glyphState.initialized = true
  const stored = parseStoredGlyphArtifact(readNamespacedStorageItem(GLYPH_ARTIFACT_STORAGE_SUFFIX))

  if (stored) {
    setArtifact(stored)
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
  setArtifact(null)
  glyphState.error = null
  glyphState.notice = 'Personal glyph reset to the built-in fallback.'
  removeNamespacedStorageItem(GLYPH_ARTIFACT_STORAGE_SUFFIX)
}

export async function syncRemoteGlyphArtifact(profile?: null | string): Promise<boolean> {
  glyphState.syncing = true
  glyphState.error = null
  glyphState.notice = null

  try {
    const targetProfile = normalizeProfileKey(profile ?? profileState.activeGatewayProfile)
    const artifact = applyGlyphArtifact(await getCurrentGlyphArtifact(targetProfile))
    glyphState.notice = `Synced ${artifact.manifest.name} from Hermes.`
    return true
  } catch (error) {
    glyphState.error = messageForError(error)
    return false
  } finally {
    glyphState.syncing = false
  }
}

export async function requestGlyphGeneration(
  glyphPrompt: string,
  options: GlyphGenerationOptions = {}
): Promise<boolean> {
  const prompt = glyphPrompt.trim()

  if (!prompt) {
    glyphState.error = 'Describe the glyph before sending it to AGENT.'
    return false
  }

  glyphState.generating = true
  glyphState.error = null
  glyphState.notice = null

  try {
    const ok = await submitPrompt(options.sessionId ?? null, {
      commitRoute: false,
      queue: false,
      text: buildGlyphSkillPrompt(prompt)
    })

    if (!ok) {
      glyphState.error = 'Hermes AGENT did not accept the glyph skill prompt.'
      return false
    }

    glyphState.lastPrompt = prompt
    glyphState.notice = 'Glyph skill sent to AGENT. Sync latest after the agent reports the artifact is ready.'
    return true
  } catch (error) {
    glyphState.error = messageForError(error)
    return false
  } finally {
    glyphState.generating = false
  }
}
