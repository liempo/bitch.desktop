# Personal glyphs

BITCH can personalize the in-app GLYPH without executing agent-generated renderer code. The renderer keeps using Threlte/Three.js, but Hermes supplies a validated declarative scene artifact.

## Flow

1. The user opens the edit action in the GLYPH panel and writes a `glyph_prompt`.
2. BITCH builds a constrained glyph-generation prompt and submits it to Hermes AGENT through the existing composer/gateway path.
3. The agent writes the artifact to `$HERMES_HOME/bitch/glyph`:
   - `manifest.json`
   - `glyph.scene.json`
   - `preview.png`
   - `source.md`
4. BITCH syncs the current artifact from the authenticated dashboard plugin route:
   - `GET /api/plugins/bitch/glyph/current`
5. BITCH validates the scene spec, stores the artifact in local namespaced storage, and updates every `GlyphCanvas` instance.

## Artifact contract

`manifest.json` uses `kind: "bitch.glyph"` and `schemaVersion: 1`. The authoritative render contract is `glyph.scene.json`; `preview.png` is optional presentation output from Hermes and is not executed by the renderer.

Supported scene object types are intentionally limited:

- `box`
- `sphere`
- `icosahedron`
- `octahedron`
- `tetrahedron`
- `torus`
- `ring`

Supported render modes are `edges`, `wireframe`, and `solid`. Colors should use theme tokens (`foreground`, `muted`, `line`, `primary`) or explicit hex accents. CPU/RAM-driven animation can be expressed through `telemetry` on objects and `animation.telemetryBoost` at scene level.

## Security and runtime behavior

BITCH does **not** copy executable Svelte/TypeScript/JavaScript into the app and does not dynamically import generated code. Generated artifacts are data only. The renderer owns all Three.js object creation, bounds normalization, scaling, and animation.

If no valid personal artifact exists, `GlyphCanvas` falls back to the built-in Threlte glyph.
