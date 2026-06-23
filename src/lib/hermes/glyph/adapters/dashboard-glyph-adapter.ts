import { dashboardRequest } from '$lib/hermes/shared/adapters/dashboard-api-client'

import type { RawGlyphArtifactResponse, RawGlyphGenerateResponse, RawGlyphListResponse } from '../domain/types'

export const BITCH_GLYPH_PLUGIN_BASE = '/api/plugins/bitch/glyph'

function normalizedProfile(profile?: null | string): string | undefined {
  return profile?.trim() || undefined
}

function glyphIdSuffix(glyphId?: null | string): string {
  const normalizedId = glyphId?.trim()
  return normalizedId ? `?id=${encodeURIComponent(normalizedId)}` : ''
}

export function generateGlyphArtifact(prompt: string, profile?: null | string): Promise<RawGlyphGenerateResponse> {
  return dashboardRequest<RawGlyphGenerateResponse>({
    path: `${BITCH_GLYPH_PLUGIN_BASE}/generate?prompt=${encodeURIComponent(prompt)}`,
    profile: normalizedProfile(profile)
  })
}

export function getCurrentGlyphArtifact(
  profile?: null | string,
  glyphId?: null | string
): Promise<RawGlyphArtifactResponse> {
  return dashboardRequest<RawGlyphArtifactResponse>({
    path: `${BITCH_GLYPH_PLUGIN_BASE}/current${glyphIdSuffix(glyphId)}`,
    profile: normalizedProfile(profile)
  })
}

export function listGlyphArtifacts(profile?: null | string): Promise<RawGlyphListResponse> {
  return dashboardRequest<RawGlyphListResponse>({
    path: `${BITCH_GLYPH_PLUGIN_BASE}/list`,
    profile: normalizedProfile(profile)
  })
}
