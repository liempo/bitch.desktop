# Personal glyphs

BITCH can personalize the in-app GLYPH without executing generated renderer code. The renderer keeps using Threlte/Three.js, but Hermes supplies a validated declarative scene artifact through the BITCH dashboard plugin.

## Flow

1. The user opens the edit action in the GLYPH panel and writes a `glyph_prompt`.
2. BITCH calls the authenticated Hermes dashboard plugin route through the Tauri `dashboard_request` bridge:
   - `GET /api/plugins/bitch/glyph/generate?prompt=...`
3. The plugin generates and persists a glyph artifact under Hermes home:
   - `$HERMES_HOME/bitch/glyph/current.json`
   - `$HERMES_HOME/bitch/glyph/generated/<glyph-id>/manifest.json`
   - `$HERMES_HOME/bitch/glyph/generated/<glyph-id>/glyph.scene.json`
   - `$HERMES_HOME/bitch/glyph/generated/<glyph-id>/preview.png`
   - `$HERMES_HOME/bitch/glyph/generated/<glyph-id>/source.md`
4. `generate` returns the generated glyph ID. BITCH then loads the artifact with:
   - `GET /api/plugins/bitch/glyph/current?id=<glyph-id>`
5. The editor lists existing generated glyphs with:
   - `GET /api/plugins/bitch/glyph/list`
6. BITCH validates the scene spec, stores the selected artifact in local namespaced storage, updates every `GlyphCanvas` instance, and uses `preview.png` to update the macOS app/Dock icon when the preview is present.

## Artifact contract

`manifest.json` uses `kind: "bitch.glyph"`, `schemaVersion: 1`, and an `id` that matches the generated directory. The authoritative render contract is `glyph.scene.json`; `preview.png` is optional presentation output from Hermes and is not executed by the renderer. On macOS, BITCH also treats the synced PNG preview as the dynamic app/Dock icon; if the preview is absent, the in-app glyph can still update but the app icon remains unchanged. Transparent PNG previews are accepted because BITCH composites the dynamic app icon onto the standard macOS-style BITCH icon plate before sending it to the native bridge.

Supported scene object types are intentionally limited:

- `box`
- `sphere`
- `icosahedron`
- `octahedron`
- `tetrahedron`
- `torus`
- `ring`

Supported render modes are `edges`, `wireframe`, and `solid`. Colors should use theme tokens (`foreground`, `muted`, `line`, `primary`) or explicit hex accents. CPU/RAM-driven animation can be expressed through `telemetry` on objects and `animation.telemetryBoost` at scene level.

## Persistence and fallback behavior

Generated glyphs are persisted plugin-side in `$HERMES_HOME/bitch/glyph/generated/<glyph-id>/`. The plugin stores the latest generated/current pointer in `$HERMES_HOME/bitch/glyph/current.json`.

BITCH also stores the selected validated artifact in local namespaced storage so the last selected glyph can render immediately on restart. The desktop client never reads `$HERMES_HOME` directly.

If no valid personal artifact exists, or if the editor asks for a glyph ID that the plugin can no longer find, `GlyphCanvas` falls back to the built-in Threlte glyph and BITCH resets the dynamic app icon to the bundled app icon.

## Security and runtime behavior

BITCH does **not** copy executable Svelte/TypeScript/JavaScript into the app and does not dynamically import generated code. Generated artifacts are data only. The renderer owns all Three.js object creation, bounds normalization, scaling, and animation.

The plugin generates plugin-side using the same constrained glyph artifact contract that the previous glyph skill described. It does not require BITCH to send a composer/AGENT message to generate a glyph.

## Hermes plugin deployment

The root `plugin/` folder contains the Hermes dashboard plugin source for the BITCH glyph API:

```txt
GET /api/plugins/bitch/glyph/generate?prompt=...
GET /api/plugins/bitch/glyph/list
GET /api/plugins/bitch/glyph/current
```

Important: current Hermes dashboard security only auto-imports Python dashboard plugin APIs from **bundled** plugins. Installing this folder as a normal user plugin under `$HERMES_HOME/plugins/bitch` is not enough to mount `dashboard/plugin_api.py`; user-installed dashboard plugins can provide static dashboard assets, but backend API import is refused. Deploy the folder as a bundled Hermes plugin, for example at `<hermes-agent>/plugins/bitch/`, then restart the Hermes dashboard.
