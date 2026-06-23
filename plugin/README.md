# BITCH Hermes dashboard plugin

This folder contains the Hermes dashboard plugin API that backs BITCH personal glyph generation, listing, and sync.

It serves the renderer contract used by BITCH:

```txt
GET /api/plugins/bitch/glyph/generate?prompt=...
GET /api/plugins/bitch/glyph/list
GET /api/plugins/bitch/glyph/current
GET /api/plugins/bitch/glyph/current?id=<glyph-id>
```

## Filesystem layout

The plugin persists generated glyphs under Hermes home:

```txt
$HERMES_HOME/bitch/glyph/
  current.json
  generated/
    <glyph-id>/
      manifest.json
      glyph.scene.json
      preview.png
      source.md
```

`generate` creates a stable glyph ID, writes the artifact directory, updates `current.json`, and returns:

```json
{ "ok": true, "id": "<glyph-id>", "glyphId": "<glyph-id>" }
```

`list` scans `generated/*` and returns glyph summaries plus the current pointer. `current` returns the current glyph, or a specific generated glyph when called with `?id=<glyph-id>`. If a requested ID does not exist, the endpoint returns `404`; BITCH then falls back to its built-in glyph.

For compatibility with the first plugin version, `current` can still read a legacy root artifact from:

```txt
$HERMES_HOME/bitch/glyph/
  manifest.json
  glyph.scene.json
  preview.png      # optional
  source.md        # not served by this API
```

## Generation model

The plugin does not ask the desktop app to send an AGENT/composer message. It generates plugin-side using the constrained BITCH glyph artifact contract: declarative `glyph.scene.json`, metadata in `manifest.json`, and a transparent PNG preview. The renderer validates and renders the scene; it never executes generated code.

## Important deployment note

Current Hermes dashboard security only auto-imports Python `dashboard/plugin_api.py` files from **bundled** dashboard plugins. User-installed plugins under `$HERMES_HOME/plugins` can contribute static dashboard UI assets, but their Python backend APIs are intentionally refused by the dashboard server.

So this folder is useful as the source package for the glyph plugin, but copying it to `$HERMES_HOME/plugins/bitch` is not enough to mount the API on current Hermes versions.

To use it, deploy it with Hermes as a bundled plugin, for example by copying or symlinking this folder into the Hermes source/packaged bundled plugin tree as:

```txt
<hermes-agent>/plugins/bitch/
```

Then restart the Hermes dashboard. The dashboard should mount the API under:

```txt
/api/plugins/bitch/
```

## Why this is separate from the BITCH app

BITCH stays remote-only: it does not start Hermes locally and does not read `$HERMES_HOME` from the desktop client. The desktop app asks the authenticated remote Hermes dashboard for generated glyphs, and this plugin is the Hermes-side generator/reader for those artifacts.
