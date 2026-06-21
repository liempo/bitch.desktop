# 01 — Tauri HTTP bridge

**Goal:** Give the renderer a safe equivalent of the Electron
`window.hermesDesktop.api({ path, method, body })` proxy so it can reach the
remote dashboard's HTTP API without ever holding `HERMES_DASHBOARD_SESSION_TOKEN`.

## Rust ([`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs))

- Add a `dashboard_request` command: `{ path, method?, body? }` → JSON `Value`.
- Reuse `resolve_gateway_config()` for the base URL + token and the existing
  `.env` resolution, exactly like the WebSocket path.
- Attach the `X-Hermes-Session-Token` header on every request.
- Default method `GET`; support `GET`/`POST`/`PUT`/`PATCH`/`DELETE`. Serialize
  `body` as JSON when present.
- Guard `path` so it must start with `/api/` (avoid an open proxy).
- 15s timeout (reuse `HTTP_TIMEOUT_SECS`). On non-2xx, return an error string
  that includes the status and a truncated body (reuse `summarize_response_body`).
- Register the command in `tauri::generate_handler!`.

## TypeScript

- [`src/lib/types/hermes.ts`](../src/lib/types/hermes.ts) — minimal types
  adapted from upstream: `SessionInfo`, `SessionMessage`, `SessionMessagesResponse`,
  `PaginatedSessions`, `SessionSearchResult`, `SessionSearchResponse`,
  `SessionCreateResponse`, `SessionResumeResponse`, `UsageStats`,
  `ModelInfoResponse`, `ModelOptionsResponse`, `ModelOptionProvider`.
- [`src/lib/hermes/shared/adapters/dashboard-api-client.ts`](../src/lib/hermes/shared/adapters/dashboard-api-client.ts) — a
  `dashboardRequest<T>({ path, method?, body? })` wrapper over
  `invoke('dashboard_request', ...)` plus session helpers mirroring upstream
  [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts):
  `listSessions`, `searchSessions`, `getSessionMessages`, `renameSession`,
  `setSessionArchived`, `deleteSession`, `getGlobalModelInfo`,
  `getModelOptions`. Legacy `$lib/api/dashboard` re-exports this Hermes-lane adapter during migration.

## Upstream files

- [electron/preload.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/preload.cjs) — exposes `api({ path, method, body })`
- [electron/main.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/main.cjs) — search the `api` IPC handler / session routes
- [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts) — session helper signatures
- [types/hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/types/hermes.ts) — response shapes

## Acceptance

From the renderer (no devtools required), `listSessions()` returns the remote
session list and `getSessionMessages(id)` returns a stored transcript against a
configured gateway.
