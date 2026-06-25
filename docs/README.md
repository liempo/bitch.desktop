# BITCH documentation

This directory is organized by feature boundary rather than by incident report.
The root architecture overview is [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
`docs/roadmap.md` remains the Kanban scanner source of truth; only unchecked
items under its `## Feature checklist` are task sources.

## Feature hierarchy

| Area                                | Docs                                                     | Code boundary                                                                                                   |
| ----------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Hermes dashboard/runtime            | [`hermes/README.md`](hermes/README.md)                   | `src/lib/hermes/*`, `src-tauri/src/hermes/*`, stable `commands/dashboard.rs` and `commands/gateway.rs` wrappers |
| Monitoring / Beszel                 | [`monitoring/beszel.md`](monitoring/beszel.md)           | `src/lib/monitoring/*`, `src-tauri/src/monitoring/*`, `commands/monitoring.rs`                                  |
| Platform / native bridge            | [`platform/native-bridge.md`](platform/native-bridge.md) | `src/lib/platform/*`, `src-tauri/src/platform/*`, shared Rust `config/errors/http` helpers                      |
| Shared conventions and future lanes | [`shared/backend-revamp.md`](shared/backend-revamp.md)   | architecture-boundary tests, migration rules, future lane pattern                                               |
| Roadmap                             | [`roadmap.md`](roadmap.md)                               | scannable feature checklist and delivered/backlog history                                                       |
| Devlog                              | [`devlog.md`](devlog.md)                                 | chronological historical notes                                                                                  |

## Hermes feature docs

- [`hermes/http-bridge.md`](hermes/http-bridge.md) — Hermes dashboard HTTP bridge
  through Tauri; `dashboard_request` is Hermes-only.
- [`hermes/remote-files.md`](hermes/remote-files.md) — official Hermes remote
  file, preview, attachment, and inline media behavior.
- [`hermes/remote-profile-support.md`](hermes/remote-profile-support.md) —
  profile-scoped dashboard/gateway routing.
- [`hermes/session-sidebar.md`](hermes/session-sidebar.md) — session list,
  switching, archive/delete/rename behavior.
- [`hermes/message-conversation.md`](hermes/message-conversation.md) — conversation message model,
  streaming, tools, markdown, and rehydration.
- [`hermes/rich-composer.md`](hermes/rich-composer.md) — composer queue,
  attachments, slash commands, and model controls.
- [`hermes/interactive-prompts.md`](hermes/interactive-prompts.md) — clarify,
  approval, sudo, and secret prompt responses.
- [`hermes/live-conversation-preservation.md`](hermes/live-conversation-preservation.md) —
  resume/busy-state invariants for running sessions.

## Shared and platform docs

- [`shared/app-shell.md`](shared/app-shell.md) — app shell, route, and layout
  behavior for `AGENT`, `ASSETS`, and `CALENDAR`.
- [`shared/backend-revamp.md`](shared/backend-revamp.md) — backend lane migration
  history plus reusable Clean MVVM / Ports & Adapters rules.
- [`ui-componentization-audit.md`](ui-componentization-audit.md) — renderer UI
  componentization scan, Bits UI candidates, and deferred extraction plan.
- [`platform/native-bridge.md`](platform/native-bridge.md) — Rust bridge lane
  responsibilities and stable Tauri command wrapper policy.
