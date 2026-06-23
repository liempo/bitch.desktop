import { dashboardRequest } from '$lib/hermes/shared/adapters/dashboard-api-client'

import type { RawGlyphArtifactResponse } from '../domain/types'

export const BITCH_GLYPH_PLUGIN_BASE = '/api/plugins/bitch/glyph'

function normalizedProfile(profile?: null | string): string | undefined {
  return profile?.trim() || undefined
}

export function getCurrentGlyphArtifact(profile?: null | string): Promise<RawGlyphArtifactResponse> {
  return dashboardRequest<RawGlyphArtifactResponse>({
    path: `${BITCH_GLYPH_PLUGIN_BASE}/current`,
    profile: normalizedProfile(profile)
  })
}
