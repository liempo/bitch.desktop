# Hermes documentation

The Hermes lane owns dashboard/runtime behavior only. It includes the Svelte
renderer facades under `src/lib/hermes/*` and the privileged Rust backend helpers
under `src-tauri/src/hermes/*`.

## Boundary contract

Hermes owns:

- dashboard `/api/*` requests through the Tauri `dashboard_request` command;
- authenticated remote filesystem, preview, attachment, and inline media routes;
- JSON-RPC runtime traffic through the Tauri WebSocket shim;
- profile-scoped sessions, profiles, prompts, composer behavior, Cron, Kanban,
  BITCH glyph artifacts, and other Hermes dashboard/plugin APIs.

Hermes must not own Beszel/monitoring or generic native platform helpers.
`dashboard_request` is path-validated for Hermes `/api/*` routes and must not be
expanded into a generic proxy for monitoring, CalDAV, or future services.

## Renderer structure

```text
src/lib/hermes/
  shared/adapters/dashboard-api-client.ts
  dashboard/
  cron/
  kanban/
  gateway/
  glyph/
  sessions/
  conversations/
  files/
  profiles/
  composer/
  prompts/
```

Callers should import from `$lib/hermes/...` public entrypoints. Legacy
top-level Hermes compatibility folders and `$lib/stores/*` shims were removed
after call sites migrated; do not recreate them for new work.

## Feature docs

- [`http-bridge.md`](http-bridge.md) — Hermes dashboard HTTP bridge and
  dashboard REST client.
- [`remote-files.md`](remote-files.md) — remote filesystem, preview, media, and
  attachment behavior.
- [`remote-profile-support.md`](remote-profile-support.md) — profile-scoped
  dashboard and gateway routing.
- [`session-sidebar.md`](session-sidebar.md) — session sidebar and switching.
- [`message-conversation.md`](message-conversation.md) — message/conversation normalization and
  rendering.
- [`rich-composer.md`](rich-composer.md) — composer orchestration, queueing,
  slash commands, and model controls.
- [`interactive-prompts.md`](interactive-prompts.md) — prompt response state and
  UI behavior.
- [`personal-glyphs.md`](personal-glyphs.md) — BITCH-side glyph generation prompt,
  validated Threlte scene artifacts, and plugin sync behavior.
- [`live-conversation-preservation.md`](live-conversation-preservation.md) — running-session
  resume and busy synchronization.

See [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) for the complete lane model.
