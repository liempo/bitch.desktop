# Hermes lane

`src/lib/hermes` is the compatibility facade for renderer-side Hermes dashboard/runtime contracts. It establishes the target lane before internals are moved so consumers can migrate imports without changing behavior.

## Boundary

The Hermes lane owns only Hermes dashboard and runtime concerns:

- dashboard `/api/*` requests through the Tauri `dashboard_request` command;
- authenticated remote filesystem and media preview helpers;
- JSON-RPC gateway client wiring and the Tauri WebSocket shim;
- profile-scoped Hermes dashboard/plugin helpers such as sessions, cron, Kanban, prompts, and runtime calls.

The lane must not absorb Beszel/host telemetry or generic native helpers. Monitoring belongs in `src/lib/monitoring`; native capabilities belong in `src/lib/platform`. Future non-Hermes services get their own lane.

## Compatibility contract

The subfeature entrypoints here are the preferred Hermes-lane imports. Some legacy top-level folders now re-export them during the migration:

- `src/lib/hermes/dashboard` wraps `src/lib/api` for dashboard REST/plugin routes
- `src/lib/hermes/files` owns authenticated remote-file helpers
- `src/lib/hermes/gateway` owns JSON-RPC gateway transport, the Tauri WebSocket shim, and runtime ports
- `src/lib/hermes/sessions` owns session lifecycle, resume, sidebar, and transitional session ViewModel exports
- `src/lib/hermes/threads` owns canvas, preview, media attachment, and message normalization helpers

Existing imports from `$lib/api`, `$lib/files`, `$lib/gateway`, `$lib/session`, `$lib/thread`, and `$lib/messages` remain valid during the migration. New Hermes-lane work should prefer `$lib/hermes/...` once a slice owns that call site.
