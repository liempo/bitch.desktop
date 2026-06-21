# `src/lib` map

Shared renderer code is grouped by boundary instead of parked at the root. Prefer stable folder `index.ts` barrels when they exist so internals can move behind explicit contracts during the backend revamp.

- `api/` — typed HTTP dashboard helpers that go through the Tauri `dashboard_request` bridge.
- `errors/` — shared error normalization helpers.
- `files/` — transitional compatibility re-exports for the Hermes remote-file lane; new code should import `$lib/hermes/files`.
- `gateway/` — transitional compatibility re-exports for the Hermes gateway lane; new code should import `$lib/hermes/gateway`.
- `hermes/` — Hermes lane facades for dashboard REST/plugin routes, remote files, gateway runtime contracts, sessions, and thread normalization.
  - `hermes/files/` — authenticated remote filesystem Ports & Adapters modules for `@file:`, `MEDIA:`, Assets, preview, and attachment behavior.
  - `hermes/gateway/` — JSON-RPC runtime transport, Hermes gateway subclass, Tauri WebSocket shim, and gateway runtime ports.
  - `hermes/sessions/` — session lifecycle/resume/sidebar helpers plus transitional session ViewModel exports.
  - `hermes/threads/` — canvas, preview, media attachment, and gateway message normalization helpers.
- `monitoring/` — standalone Beszel host monitor configuration, fetch, normalization, and formatting helpers.
- `messages/` — transitional compatibility re-exports for Hermes thread/message normalization helpers.
- `platform/` — renderer adapter boundary for native Tauri commands/events and OS utilities.
- `session/` — transitional compatibility re-exports for Hermes session orchestration helpers.
- `stores/` — Svelte 5 rune stores for app state.
- `thread/` — transitional compatibility re-exports for Hermes thread preview and canvas helpers.
- `types/` — shared Hermes dashboard and gateway DTOs.

Keep token-bearing HTTP calls in `api/`/`hermes/` and the Tauri/Rust bridge. The Vite renderer should never hold `HERMES_DASHBOARD_SESSION_TOKEN` directly. Monitoring must not call Hermes `dashboard_request`; platform helpers must not know Hermes or Beszel route details.
