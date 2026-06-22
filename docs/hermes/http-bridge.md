# 01 — Tauri HTTP bridge

**Goal:** Give the renderer a safe equivalent of the Electron
`window.hermesDesktop.api({ path, method, body })` proxy so it can reach the
remote dashboard's HTTP API without ever holding dashboard tokens, username/password
credentials, or session cookies.

## Rust Hermes lane

- [`src-tauri/src/commands/dashboard.rs`](../../src-tauri/src/commands/dashboard.rs)
  exposes the stable `dashboard_request` command: `{ path, method?, body? }` → JSON `Value`.
- [`src-tauri/src/hermes/dashboard_http.rs`](../../src-tauri/src/hermes/dashboard_http.rs)
  owns Hermes dashboard proxying and guards `path` so it must start with `/api/`.
- [`src-tauri/src/hermes/config.rs`](../../src-tauri/src/hermes/config.rs),
  [`src-tauri/src/hermes/auth.rs`](../../src-tauri/src/hermes/auth.rs), and
  [`src-tauri/src/hermes/session_auth.rs`](../../src-tauri/src/hermes/session_auth.rs)
  own the dashboard base URL, session-token compatibility, password-login session
  cookies, WS tickets, and auth headers.
- [`src-tauri/src/http.rs`](../../src-tauri/src/http.rs) owns generic timeout,
  client, and response-summary helpers without route-specific knowledge.
- The command is registered from [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs),
  which should remain the app builder and invoke-handler switchboard only.

## TypeScript

- [`src/lib/types/hermes.ts`](../../src/lib/types/hermes.ts) — minimal types
  adapted from upstream: `SessionInfo`, `SessionMessage`, `SessionMessagesResponse`,
  `PaginatedSessions`, `SessionSearchResult`, `SessionSearchResponse`,
  `SessionCreateResponse`, `SessionResumeResponse`, `UsageStats`,
  `ModelInfoResponse`, `ModelOptionsResponse`, `ModelOptionProvider`.
- [`src/lib/hermes/shared/adapters/dashboard-api-client.ts`](../../src/lib/hermes/shared/adapters/dashboard-api-client.ts) — a
  `dashboardRequest<T>({ path, method?, body? })` wrapper over
  `invoke('dashboard_request', ...)` plus session helpers mirroring upstream
  [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts):
  `listSessions`, `searchSessions`, `getSessionMessages`, `renameSession`,
  `setSessionArchived`, `deleteSession`, `getGlobalModelInfo`,
  `getModelOptions`. `$lib/hermes/dashboard` is the public Hermes-lane facade for these helpers.

## Upstream files

- [electron/preload.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/preload.cjs) — exposes `api({ path, method, body })`
- [electron/main.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/main.cjs) — search the `api` IPC handler / session routes
- [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts) — session helper signatures
- [types/hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/types/hermes.ts) — response shapes

## Auth modes

The bridge supports two remote dashboard auth modes:

- `authMode: "token"` — legacy/static token compatibility. REST requests attach
  `X-Hermes-Session-Token`; WebSocket connections use the existing token query path.
- `authMode: "session"` — Hermes dashboard login/session-cookie auth. This is used
  for upstream providers such as `basic`, `nous`, `self-hosted`, or OIDC after login.
  The username/password provider named `basic` is **not HTTP Basic Auth**; it is a
  JSON `POST /auth/password-login` flow that returns HttpOnly dashboard cookies.

For the `basic` provider, `.env` can seed the native bridge without exposing the
password to Svelte:

```bash
HERMES_DASHBOARD_URL=http://VM_IP:9119
HERMES_DASHBOARD_USERNAME=admin
HERMES_DASHBOARD_PASSWORD=choose-a-strong-password
```

When `HERMES_DASHBOARD_SESSION_TOKEN` is absent and both username/password values
are present, Rust resolves the connection as `authMode: "session"`, posts:

```json
{
  "provider": "basic",
  "username": "admin",
  "password": "choose-a-strong-password",
  "next": "/"
}
```

to `/auth/password-login`, stores the returned dashboard cookies in the Tauri
process, attaches those cookies to `/api/*` calls, and mints `/api/auth/ws-ticket`
for gated WebSocket connections. `HERMES_DASHBOARD_AUTH_PROVIDER` may override the
provider name if a deployment uses a non-`basic` password provider.

## Acceptance

From the renderer (no devtools required), `listSessions()` returns the remote
session list and `getSessionMessages(id)` returns a stored transcript against a
configured gateway using either token auth or session-cookie auth.
