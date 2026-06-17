# Plan 03 — Hermes `bitch-files` Plugin

> **For Hermes:** Implement after or in parallel with Plan 01. This is the server-side/reference-generation piece so the agent does not have to remember raw string syntax.

**Goal:** Create a Hermes plugin that exposes tools for generating canonical bitch.desktop file/media references.

**Architecture:** A user/profile Hermes plugin registers tools via `ctx.register_tool`. Tools return JSON containing the canonical directive string (`@file:` or `MEDIA:`), normalized path, label, media kind, and optional dufs URL metadata. The plugin does not validate file existence in v1.

**Primary location:**

- Create: `/box/.hermes/plugins/bitch-files/plugin.yaml`
- Create: `/box/.hermes/plugins/bitch-files/__init__.py`
- Create: `/box/.hermes/plugins/bitch-files/schemas.py`
- Create: `/box/.hermes/plugins/bitch-files/tools.py`
- Optional repo mirror later: `liempo/homestation` or a dedicated plugin repo if this should deploy with homestation.

---

## Task 1: Create plugin manifest

`plugin.yaml`:

```yaml
name: bitch-files
version: 0.1.0
description: Generate canonical bitch.desktop file and media references for BOX/dufs and local gateway files.
provides_tools:
  - bitch_file_ref
  - bitch_media_ref
```

## Task 2: Implement path normalization helpers

**Objective:** Normalize paths without validating existence.

Rules:

- `file:///box/a%20b.png` → `/box/a b.png`
- `/box/...` source → `box`
- non-`/box` absolute path source → `local`
- filenames become labels unless caller provides a label.
- quote emitted refs when path contains whitespace or shell-hostile punctuation.

Suggested output quoting:

```python
def quote_ref(value: str) -> str:
    if not any(ch.isspace() for ch in value) and not any(ch in value for ch in '()[]{}<>"\'`'):
        return value
    if '`' not in value:
        return f'`{value}`'
    if '"' not in value:
        return f'"{value}"'
    return value
```

## Task 3: Register `bitch_file_ref`

**Objective:** Return preview-sidebar references.

Schema intent:

```json
{
  "path": "absolute file path, usually /box/...",
  "label": "optional display label",
  "source": "auto | box | local"
}
```

Behavior:

- `/box/report.pdf` → `@file:/box/report.pdf`
- `/opt/data/report.pdf` → `@local:/opt/data/report.pdf`
- no existence check.

Return:

```json
{
  "success": true,
  "reference": "@file:/box/report.pdf",
  "path": "/box/report.pdf",
  "source": "box",
  "label": "report.pdf",
  "kind": "file"
}
```

## Task 4: Register `bitch_media_ref`

**Objective:** Return in-thread media references.

Behavior:

- image/audio/video paths → `MEDIA:<path>`.
- `presentation: preview` can delegate to `bitch_file_ref` semantics.
- plugin emits `MEDIA:` as canonical inline media directive, not `@image:`.

Return:

```json
{
  "success": true,
  "reference": "MEDIA:/box/render.png",
  "path": "/box/render.png",
  "source": "box",
  "label": "render.png",
  "kind": "image"
}
```

## Task 5: Enable and test plugin

Commands:

```bash
/opt/hermes/bin/hermes plugins list
/opt/hermes/bin/hermes plugins enable bitch-files
/opt/hermes/bin/hermes doctor
```

Then start a fresh Hermes session and verify the model has access to:

- `bitch_file_ref`
- `bitch_media_ref`

If a direct plugin test harness is available, call handlers directly with Python unit tests.

## Task 6: Decide packaging home

Open decision for Liempo:

- Keep as active profile plugin only.
- Mirror in `liempo/homestation` so deployment owns it.
- Create a dedicated `liempo/bitch-files-plugin` repo.

Completion proof:

- Plugin discovered and enabled.
- Fresh session exposes tools.
- Tool outputs exact canonical directives.
- No file existence validation or secret leakage.
