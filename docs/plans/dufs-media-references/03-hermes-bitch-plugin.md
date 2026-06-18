# Plan 03 — Hermes `bitch` Plugin

> **For Hermes:** Implement after or in parallel with Plan 01. This is the server-side/reference-generation piece so the agent does not have to remember raw string syntax.

**Goal:** Create/use the Hermes `bitch` plugin that exposes tools for generating canonical bitch.desktop file/media references.

**Architecture:** A user/profile Hermes plugin registers tools via `ctx.register_tool`. Tools return JSON containing the canonical directive string (`@file:` or `MEDIA:`), normalized path, label, and media kind. The plugin does not validate file existence in v1.

**Primary location:**

- Repository: `liempo/bitch.plugin`
- Installed plugin path: `/box/.hermes/plugins/bitch`
- Manifest: `/box/.hermes/plugins/bitch/plugin.yaml`
- Registration: `/box/.hermes/plugins/bitch/__init__.py`
- Schemas: `/box/.hermes/plugins/bitch/schemas.py`
- Handlers: `/box/.hermes/plugins/bitch/tools.py`

---

## Task 1: Create plugin manifest

`plugin.yaml`:

```yaml
name: bitch
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
/opt/hermes/bin/hermes plugins install liempo/bitch.plugin
/opt/hermes/bin/hermes plugins enable bitch
/opt/hermes/bin/hermes doctor
```

Then start a fresh Hermes session and verify the model has access to:

- `bitch_file_ref`
- `bitch_media_ref`

If a direct plugin test harness is available, call handlers directly with Python unit tests:

```bash
python3 /box/.hermes/plugins/bitch/tests/test_tools.py
```

## Task 6: Packaging home

Resolved packaging home:

- Dedicated repository: `liempo/bitch.plugin`
- Active-profile install name: `bitch`
- Previous local name `bitch-files` is deprecated and should not be reintroduced.

Completion proof:

- Plugin discovered and enabled.
- Fresh session exposes tools.
- Tool outputs exact canonical directives.
- No file existence validation or secret leakage.
