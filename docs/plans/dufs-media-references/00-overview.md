# Dufs File/Media References — Overview Plan

> **For Hermes:** Use `kanban-workflows` and `test-driven-development` to implement the child plans in order. Treat this file as the feature index, not a code-change plan by itself.

**Goal:** Simplify bitch.desktop thread media and file-link behavior around explicit directives, dufs-backed BOX URLs, and a Hermes plugin that lets the agent generate correct references without guessing syntax.

**Architecture:** dufs remains the HTTP file server. bitch.desktop owns rendering. A Hermes plugin owns server-side reference generation and path normalization. Raw paths are never magically linked.

**Canonical semantics:**

| Text emitted by user/agent | Meaning                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `/box/foo.png`             | plain markdown/text only                                                  |
| `@file:/box/foo.pdf`       | simple visible link; click opens right preview sidebar                    |
| `@local:/opt/data/foo.png` | explicit local/gateway reference; frontend/plugin decides bridge behavior |
| `MEDIA:/box/foo.png`       | upstream-style in-thread media rendering                                  |
| `@image:/box/foo.png`      | deprecated compatibility alias for inline image/media                     |

**Decision log:**

- Prefix selected by Liempo: `@file:`.
- Raw `/box/...` paths: never auto-link.
- `@image:`: keep, deprecate in favor of `MEDIA:`.
- Visual style for `@file:`: simple link, not a rich card.
- Preview target: right preview sidebar.
- Media renderer: copy upstream Hermes Desktop behavior where possible.
- Existence validation: no validation in v1.
- Agent steering: plugin/tool, not prompt-only.
- Namespace split: `@file:` for BOX/dufs, `@local:` for local/gateway paths. Optional `@box:` alias can be accepted but should not be emitted by the plugin unless later requested.

---

## Plan Set

1. `01-frontend-file-references.md` — explicit `@file:` / `@local:` parser and right-preview behavior; remove raw `/box` auto-linking.
2. `02-upstream-media-parity.md` — copy upstream-style `MEDIA:` behavior with image/audio/video/file media rendering.
3. `03-hermes-bitch-files-plugin.md` — create Hermes plugin tools for canonical `@file:` and `MEDIA:` output.
4. `04-integration-rollout.md` — integration, docs, validation, rollout, and PR slicing.

## Recommended PR Order

1. **PR A — explicit file refs:** parser tests, raw path behavior, `@file:` preview-sidebar links.
2. **PR B — media parity:** `MEDIA:` → internal media refs; image/audio/video/file rendering; `@image:` compatibility.
3. **PR C — Hermes plugin:** `bitch_file_ref` and `bitch_media_ref`, enabled/tested in the profile or packaged repo.
4. **PR D — docs/QA polish:** README/roadmap/reference examples, migration notes, final validation.

## Acceptance Criteria

- Raw `/box/...` is plain text.
- `@file:/box/foo.pdf` renders as a simple link and opens the right preview sidebar.
- `MEDIA:/box/foo.png` renders in-thread as adaptive media.
- Audio/video formats recognized by upstream Desktop render with controls when browser-fetchable.
- `@image:` still works and is documented as legacy.
- Plugin tools return canonical directives and do not require existence checks.
- Full validation passes: `fmt:check`, `type-check`, `lint`, `test`, `frontend:build`, `npm audit`, `knip`.
