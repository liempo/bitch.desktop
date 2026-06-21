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

The subfeature entrypoints here are transitional re-exports of the existing modules:

- `src/lib/hermes/dashboard` -> `src/lib/api`
- `src/lib/hermes/files` -> `src/lib/files`
- `src/lib/hermes/gateway` -> `src/lib/gateway`

Existing imports from `$lib/api`, `$lib/files`, and `$lib/gateway` remain valid during the migration. New code that is explicitly Hermes-lane work should prefer `$lib/hermes/...` once a slice owns that call site.
