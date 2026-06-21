# `src/lib` map

Shared renderer code is grouped by boundary instead of parked at the root:

- `api/` — typed HTTP dashboard helpers that go through the Tauri `dashboard_request` bridge.
- `errors/` — shared error normalization helpers.
- `files/` — file helpers split by boundary:
  - `remote.ts` — authenticated Hermes dashboard filesystem helpers.
  - `local.ts` — reserved for future local file access support; currently intentionally empty.
  - `preview.ts` — file preview/presentation classification helpers.
  - `media.ts` — remote media/file reference rendering helpers.
- `gateway/` — JSON-RPC transport, Hermes gateway subclass, and Tauri WebSocket shim.
- `monitoring/` — Beszel host monitor configuration, fetch, normalization, and formatting helpers.
- `messages/` — transcript/message normalization helpers.
- `session/` — session orchestration helpers that coordinate stores, routing, and hydration.
- `stores/` — Svelte 5 rune stores for app state.
- `thread/` — thread preview and canvas extraction helpers.
- `types/` — shared Hermes dashboard and gateway DTOs.

Keep token-bearing HTTP calls in `api/` and the Tauri/Rust bridge. The Vite renderer should never hold `HERMES_DASHBOARD_SESSION_TOKEN` directly.
