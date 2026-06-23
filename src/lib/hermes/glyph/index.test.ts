import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/hermes/shared/adapters/dashboard-api-client', () => ({
  dashboardRequest: mockDashboardRequest
}))

import { BITCH_GLYPH_PLUGIN_BASE, getCurrentGlyphArtifact } from './adapters/dashboard-glyph-adapter'
import { normalizeGlyphArtifact } from './domain/artifact'
import { normalizeGlyphScene } from './domain/scene'
import { buildGlyphSkillPrompt } from './domain/skill-prompt'

describe('BITCH glyph artifact contract', () => {
  beforeEach(() => {
    mockDashboardRequest.mockReset()
  })

  it('builds a constrained BITCH-side skill prompt for Hermes AGENT', () => {
    const prompt = buildGlyphSkillPrompt('obsidian fox sigil with orbital memory rings')

    expect(prompt).toContain('User glyph_prompt:\nobsidian fox sigil with orbital memory rings')
    expect(prompt).toContain('$HERMES_HOME/bitch/glyph')
    expect(prompt).toContain('Do not modify BITCH app source files.')
    expect(prompt).toContain('Do not create executable renderer code as the integration contract.')
    expect(prompt).toContain('512x512px')
    expect(prompt).toContain('glyph.scene.json')
    expect(prompt).toContain('Supported object types: box, sphere, icosahedron, octahedron, tetrahedron, torus, ring.')
  })

  it('requires a non-empty glyph prompt', () => {
    expect(() => buildGlyphSkillPrompt('   ')).toThrow('Glyph prompt is required')
  })

  it('normalizes scene geometry while rejecting unknown executable-style fields', () => {
    const scene = normalizeGlyphScene({
      schemaVersion: 1,
      sceneBox: 99,
      objects: [
        {
          type: 'icosahedron',
          color: 'javascript:alert(1)',
          mode: 'edges',
          radius: 99,
          telemetry: { scale: 'cpu' }
        },
        {
          type: 'script',
          code: 'window.location="https://example.test"'
        }
      ]
    })

    expect(scene).toMatchObject({
      sceneBox: 6,
      schemaVersion: 1,
      objects: [
        {
          color: 'foreground',
          mode: 'edges',
          radius: 8,
          telemetry: { scale: 'cpu' },
          type: 'icosahedron'
        }
      ]
    })
  })

  it('accepts plugin artifacts with manifest and declarative scene JSON', () => {
    const artifact = normalizeGlyphArtifact({
      manifest: {
        schemaVersion: 1,
        kind: 'bitch.glyph',
        name: 'orbital fox',
        scene: 'glyph.scene.json',
        preview: 'preview.png'
      },
      preview_data_url: 'data:image/png;base64,AAAA',
      scene: {
        schemaVersion: 1,
        objects: [{ type: 'torus', radius: 1.4, tube: 0.04, color: 'muted' }]
      }
    })

    expect(artifact?.manifest.name).toBe('orbital fox')
    expect(artifact?.previewDataUrl).toBe('data:image/png;base64,AAAA')
    expect(artifact?.scene.objects[0]).toMatchObject({ type: 'torus', color: 'muted' })
  })

  it('routes current glyph sync through the authenticated dashboard plugin API', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ ok: true })

    await expect(getCurrentGlyphArtifact('ops/profile')).resolves.toEqual({ ok: true })

    expect(BITCH_GLYPH_PLUGIN_BASE).toBe('/api/plugins/bitch/glyph')
    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/plugins/bitch/glyph/current',
      profile: 'ops/profile'
    })
  })
})
