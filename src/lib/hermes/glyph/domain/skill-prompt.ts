import { GLYPH_CANONICAL_SIZE_PX, GLYPH_SCHEMA_VERSION, GLYPH_TARGET_SCENE_BOX } from './types'

export interface GlyphSkillPromptOptions {
  canonicalSizePx?: number
  outputDirectory?: string
  sceneBox?: number
}

export function buildGlyphSkillPrompt(glyphPrompt: string, options: GlyphSkillPromptOptions = {}): string {
  const prompt = glyphPrompt.trim()
  if (!prompt) throw new Error('Glyph prompt is required')

  const outputDirectory = options.outputDirectory?.trim() || '$HERMES_HOME/bitch/glyph'
  const canonicalSizePx = options.canonicalSizePx ?? GLYPH_CANONICAL_SIZE_PX
  const sceneBox = options.sceneBox ?? GLYPH_TARGET_SCENE_BOX

  return [
    'You are running a BITCH-side glyph generation skill for the remote Hermes dashboard client.',
    '',
    `User glyph_prompt:\n${prompt}`,
    '',
    `Write the glyph artifact under ${outputDirectory}. Create or replace exactly these files:`,
    '- manifest.json',
    '- glyph.scene.json',
    '- preview.png',
    '- source.md',
    '',
    'Hard constraints:',
    '- Do not modify BITCH app source files.',
    '- Do not create executable renderer code as the integration contract.',
    '- The authoritative artifact is glyph.scene.json, a declarative scene spec that BITCH will validate and render with Threlte/Three.js.',
    `- Render preview.png at exactly ${canonicalSizePx}x${canonicalSizePx}px. Use Three.js if you need to render a preview image.`,
    `- Keep the scene centered around origin and designed for a normalized ${sceneBox} unit bounding box.`,
    '- Prefer theme color tokens: foreground, muted, line, primary. Hex colors are allowed only for intentional accents.',
    '- Keep geometry low-poly and deterministic. No remote URLs, external textures, shaders, scripts, or secrets.',
    '',
    'glyph.scene.json schema:',
    '```json',
    JSON.stringify(
      {
        schemaVersion: GLYPH_SCHEMA_VERSION,
        sceneBox,
        camera: { fov: 46, z: 5.25 },
        animation: { rotation: [0, 0.35, 0.08], speed: 1, telemetryBoost: 'cpu' },
        objects: [
          {
            type: 'icosahedron',
            mode: 'edges',
            radius: 1.4,
            detail: 1,
            color: 'foreground',
            opacity: 0.9,
            rotation: [0.2, 0.4, 0],
            telemetry: { scale: 'cpu' }
          },
          {
            type: 'torus',
            mode: 'edges',
            radius: 1.8,
            tube: 0.025,
            color: 'muted',
            opacity: 0.45,
            rotation: [1.5708, 0, 0.2],
            telemetry: { scale: 'memory' }
          }
        ]
      },
      null,
      2
    ),
    '```',
    '',
    'Supported object types: box, sphere, icosahedron, octahedron, tetrahedron, torus, ring.',
    'Supported render modes: edges, wireframe, solid.',
    'Supported telemetry mappings: cpu and memory for object scale/opacity or animation telemetryBoost.',
    '',
    'manifest.json schema:',
    '```json',
    JSON.stringify(
      {
        schemaVersion: GLYPH_SCHEMA_VERSION,
        kind: 'bitch.glyph',
        name: 'short glyph name',
        prompt,
        scene: 'glyph.scene.json',
        preview: 'preview.png',
        canonicalSizePx,
        sceneBox
      },
      null,
      2
    ),
    '```',
    '',
    'When finished, reply with concise JSON: {"ok":true,"artifact_dir":"$HERMES_HOME/bitch/glyph","files":["manifest.json","glyph.scene.json","preview.png","source.md"]}.'
  ].join('\n')
}
