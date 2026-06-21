# `src/lib` map

Shared renderer code is grouped by boundary instead of parked at the root. Prefer stable folder `index.ts` barrels when they exist so internals can move behind explicit contracts during the backend revamp.

- `api/` — transitional compatibility re-exports for Hermes dashboard REST helpers; new code should import `$lib/hermes/dashboard`, `$lib/hermes/cron`, or `$lib/hermes/kanban`.
- `errors/` — shared error normalization helpers.
- `files/` — transitional compatibility re-exports for the Hermes remote-file lane; new code should import `$lib/hermes/files`.
- `gateway/` — transitional compatibility re-exports for the Hermes gateway lane; new code should import `$lib/hermes/gateway`.
- `hermes/` — Hermes lane facades for dashboard REST/plugin routes, remote files, gateway runtime contracts, composer orchestration, prompts, profiles, sessions, and thread normalization.
  - `hermes/cron/` — Hermes dashboard Cron plugin helpers.
  - `hermes/composer/` — slash-command parsing/dispatch, composer queueing, model/reasoning selection, attachment relay, and prompt submission orchestration.
  - `hermes/files/` — authenticated remote filesystem Ports & Adapters modules for `@file:`, `MEDIA:`, Assets, preview, and attachment behavior.
  - `hermes/gateway/` — JSON-RPC runtime transport, Hermes gateway subclass, Tauri WebSocket shim, and gateway runtime ports.
  - `hermes/kanban/` — Hermes dashboard Kanban plugin helpers.
  - `hermes/profiles/` — profile selection, profile-scoped gateway switching, and API routing helpers.
  - `hermes/prompts/` — clarify/approval/sudo/secret prompt request state and response orchestration.
  - `hermes/sessions/` — session lifecycle/resume/sidebar helpers plus transitional session ViewModel exports.
  - `hermes/threads/` — canvas, preview, media attachment, and gateway message normalization helpers.
- `monitoring/` — standalone Beszel host monitor configuration, fetch, normalization, and formatting helpers.
- `messages/` — transitional compatibility re-exports for Hermes thread/message normalization helpers.
- `platform/` — renderer adapter boundary for native Tauri commands/events and OS utilities.
- `session/` — transitional compatibility re-exports for Hermes session orchestration helpers.
- `stores/` — Svelte 5 rune stores for app state; Hermes-backed composer, prompt, and profile store paths are transitional re-exports.
- `thread/` — transitional compatibility re-exports for Hermes thread preview and canvas helpers.
- `types/` — shared Hermes dashboard and gateway DTOs.

Keep token-bearing HTTP calls in `hermes/` and the Tauri/Rust bridge; `api/` is compatibility glue, not a new feature boundary. The Vite renderer should never hold `HERMES_DASHBOARD_SESSION_TOKEN` directly. Monitoring must not call Hermes `dashboard_request`; platform helpers must not know Hermes or Beszel route details.
