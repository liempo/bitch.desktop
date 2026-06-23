import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDashboardRequest } = vi.hoisted(() => ({
  mockDashboardRequest: vi.fn()
}))

vi.mock('$lib/hermes/shared/adapters/dashboard-api-client', () => ({
  dashboardRequest: mockDashboardRequest
}))

import {
  BITCH_GLYPH_PLUGIN_BASE,
  generateGlyphArtifact,
  getCurrentGlyphArtifact,
  listGlyphArtifacts
} from './adapters/dashboard-glyph-adapter'
import { normalizeGlyphArtifact, normalizeGlyphGenerationResult, normalizeGlyphListResult } from './domain/artifact'
import { normalizeGlyphScene } from './domain/scene'
import { buildGlyphSkillPrompt } from './domain/skill-prompt'
import glyphViewModelSource from './view-models/glyph.svelte.ts?raw'

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

  it('accepts plugin artifacts with manifest ids and declarative scene JSON', () => {
    const artifact = normalizeGlyphArtifact({
      id: '20260623010101-orbital-fox-a1b2c3d4e5',
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

    expect(artifact?.id).toBe('20260623010101-orbital-fox-a1b2c3d4e5')
    expect(artifact?.manifest.name).toBe('orbital fox')
    expect(artifact?.manifest.id).toBe('20260623010101-orbital-fox-a1b2c3d4e5')
    expect(artifact?.previewDataUrl).toBe('data:image/png;base64,AAAA')
    expect(artifact?.scene.objects[0]).toMatchObject({ type: 'torus', color: 'muted' })
  })

  it('normalizes plugin generation and list responses with stable glyph ids', () => {
    expect(normalizeGlyphGenerationResult({ ok: true, glyphId: 'glyph-123' })).toEqual({ id: 'glyph-123' })

    const list = normalizeGlyphListResult({
      current_id: 'glyph-123',
      items: [
        {
          id: 'glyph-123',
          name: 'Orbital Fox',
          prompt: 'obsidian fox',
          created_at: '2026-06-23T01:01:01Z',
          has_preview: true,
          manifest: {
            schemaVersion: 1,
            kind: 'bitch.glyph',
            name: 'Orbital Fox'
          }
        },
        { id: '../bad', name: 'bad' }
      ]
    })

    expect(list.currentId).toBe('glyph-123')
    expect(list.glyphs).toEqual([
      expect.objectContaining({
        createdAt: '2026-06-23T01:01:01Z',
        hasPreview: true,
        id: 'glyph-123',
        name: 'Orbital Fox',
        prompt: 'obsidian fox'
      })
    ])
  })

  it('routes glyph generation, list, and current selection through the authenticated dashboard plugin API', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ ok: true, id: 'generated-id' })
    mockDashboardRequest.mockResolvedValueOnce({ glyphs: [] })
    mockDashboardRequest.mockResolvedValueOnce({ ok: true })

    await expect(generateGlyphArtifact('obsidian fox / memory rings', 'ops/profile')).resolves.toEqual({
      id: 'generated-id',
      ok: true
    })
    await expect(listGlyphArtifacts('ops/profile')).resolves.toEqual({ glyphs: [] })
    await expect(getCurrentGlyphArtifact('ops/profile', 'generated-id')).resolves.toEqual({ ok: true })

    expect(BITCH_GLYPH_PLUGIN_BASE).toBe('/api/plugins/bitch/glyph')
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(1, {
      path: '/api/plugins/bitch/glyph/generate?prompt=obsidian%20fox%20%2F%20memory%20rings',
      profile: 'ops/profile'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(2, {
      path: '/api/plugins/bitch/glyph/list',
      profile: 'ops/profile'
    })
    expect(mockDashboardRequest).toHaveBeenNthCalledWith(3, {
      path: '/api/plugins/bitch/glyph/current?id=generated-id',
      profile: 'ops/profile'
    })
  })

  it('routes current glyph sync without an id through the authenticated dashboard plugin API', async () => {
    mockDashboardRequest.mockResolvedValueOnce({ ok: true })

    await expect(getCurrentGlyphArtifact('ops/profile')).resolves.toEqual({ ok: true })

    expect(mockDashboardRequest).toHaveBeenCalledWith({
      path: '/api/plugins/bitch/glyph/current',
      profile: 'ops/profile'
    })
  })

  it('generates and selects glyphs through plugin API calls instead of composer messages', () => {
    expect(glyphViewModelSource).toContain('generateGlyphArtifact(prompt, targetProfile)')
    expect(glyphViewModelSource).toContain('listGlyphArtifacts(targetProfile)')
    expect(glyphViewModelSource).toContain('getCurrentGlyphArtifact(targetProfile, result.id)')
    expect(glyphViewModelSource).not.toContain('submitPrompt')
    expect(glyphViewModelSource).not.toContain('buildGlyphSkillPrompt(prompt)')
  })

  it('applies the synced preview PNG to the native dynamic app icon bridge', () => {
    expect(glyphViewModelSource).toContain('setDynamicAppIconFromDataUrl(artifact.previewDataUrl)')
    expect(glyphViewModelSource).toContain('resetDynamicAppIcon()')
    expect(glyphViewModelSource).toContain('updated the macOS app icon')
  })
})
