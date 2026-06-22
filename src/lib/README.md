# `src/lib` map

Shared renderer code is grouped by boundary instead of parked at the root. Prefer stable folder `index.ts` barrels when they exist so internals can move behind explicit contracts without reviving obsolete compatibility paths.

- `errors/` — shared error normalization helpers.
- `hermes/` — Hermes lane facades for dashboard REST/plugin routes, remote files, gateway runtime contracts, composer orchestration, prompts, profiles, sessions, and thread normalization.
  - `hermes/cron/` — Hermes dashboard Cron plugin helpers.
  - `hermes/composer/` — slash-command parsing/dispatch, composer queueing, model/reasoning selection, attachment relay, and prompt submission orchestration.
  - `hermes/files/` — authenticated remote filesystem Ports & Adapters modules for `@file:`, `MEDIA:`, Assets, preview, and attachment behavior.
  - `hermes/gateway/` — JSON-RPC runtime transport, Hermes gateway subclass, Tauri WebSocket shim, gateway runtime ports, and gateway registry ViewModel.
  - `hermes/kanban/` — Hermes dashboard Kanban plugin helpers.
  - `hermes/profiles/` — profile selection, profile-scoped gateway switching, and API routing helpers.
  - `hermes/prompts/` — clarify/approval/sudo/secret prompt request state and response orchestration.
  - `hermes/sessions/` — session lifecycle, resume, sidebar, and session ViewModel.
  - `hermes/threads/` — message ViewModel, canvas, preview, media attachment, and gateway message normalization helpers.
- `layout/` — shared layout helpers plus layout rune state for sidebar visibility and pinned sessions.
- `monitoring/` — standalone Beszel host monitor configuration, fetch, normalization, and formatting helpers.
- `notifications/` — native/user notification helpers.
- `platform/` — renderer adapter boundary for native Tauri commands/events and OS utilities.
- `storage/` — namespaced localStorage helpers.
- `types/` — shared Hermes dashboard and gateway DTOs.
- `ui/` — shared renderer UI utilities.

Legacy top-level Hermes compatibility folders (`api/`, `files/`, `gateway/`, `messages/`, `session/`, `thread/`, `composer/`, and `stores/`) have been removed. New code must import the lane-owned modules above instead of recreating source shims. The Vite renderer should never hold `HERMES_DASHBOARD_SESSION_TOKEN` directly. Monitoring must not call Hermes `dashboard_request`; platform helpers must not know Hermes or Beszel route details.
