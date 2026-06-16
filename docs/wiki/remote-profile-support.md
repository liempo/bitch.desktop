# 08 — Remote profile support

**Goal:** Treat Hermes profiles as execution contexts, not just labels. The
renderer can list/scope sessions by profile, the sidebar exposes a compact
profile rail, and the Tauri bridge routes HTTP and WebSocket traffic through the
connection configured for the selected profile.

This matches upstream Hermes Desktop's remote workaround: **one dashboard backend
per remote profile**. A single backend process still owns exactly one active
Hermes profile for live JSON-RPC chat; remote multi-profile live chat is achieved
by mapping each profile to its own dashboard URL/port.

## Data model

[`src/lib/types/hermes.ts`](../../src/lib/types/hermes.ts) adds the upstream
profile response shapes and profile ownership metadata:

- `ProfileInfo`, `ProfilesResponse`
- `SessionInfo.profile`, `SessionInfo.is_default_profile`
- `PaginatedSessions.profile_totals`, `PaginatedSessions.errors`

The session store records both the owning profile per session and any
`profile_totals` returned by `/api/profiles/sessions`. Pagination in scoped mode
compares against that profile's count rather than the global total.

## Connection config

[`src/lib/gateway/connection-config.ts`](../../src/lib/gateway/connection-config.ts)
and `src-tauri/src/lib.rs` share the same remote-only config shape:

```json
{
  "mode": "remote",
  "url": "http://127.0.0.1:9119",
  "authMode": "token",
  "token": "[REDACTED]",
  "profiles": {
    "crypto": {
      "mode": "remote",
      "url": "http://127.0.0.1:9121",
      "authMode": "token",
      "token": "[REDACTED]"
    }
  }
}
```

Tauri persists this at `$XDG_CONFIG_HOME/bitch.desktop/connection.json`, falling
back to `~/.config/bitch.desktop/connection.json` when `XDG_CONFIG_HOME` is not
set. If the file is absent, Rust seeds the connection from the existing `.env`
variables:

- `VITE_HERMES_DASHBOARD_URL`
- `BITCH_DASHBOARD_API_KEY`

New Tauri commands:

- `get_connection_config()` — read saved config or env fallback.
- `save_connection_config(config)` — persist the connection config.
- `resolve_connection(profile?)` — return the effective `{ baseUrl, authMode,
profile }` for the global config or a profile override. The dashboard token
  stays in Tauri and is not returned to the renderer on this live routing path.

## Tauri bridge

`src-tauri/src/lib.rs` now resolves connections per profile:

- `dashboard_request` accepts an optional `profile` and forwards REST calls to the
  resolved profile URL.
- `connect_ws(profile?)` opens or reuses a WebSocket proxy entry keyed by the
  normalized profile (`default` for empty/null profile).
- `send_ws_message` and `close_ws` operate on connection IDs while the internal
  proxy state remains profile-indexed.

Token auth remains the supported remote profile auth path. OAuth cookie partition
for per-profile remote URLs is intentionally deferred.

## Frontend stores

### Profile store

[`src/lib/stores/profile.svelte.ts`](../../src/lib/stores/profile.svelte.ts)
contains the profile execution state:

- `profileState.activeGatewayProfile` — profile whose live WebSocket is active.
- `profileState.showAllProfiles` — sidebar/history scope toggle.
- `getProfileScope()` — active profile or `ALL_PROFILES` sentinel.
- `refreshActiveProfile()` — loads `/api/profiles` and `/api/profiles/active`.
- `selectProfile(profile)` — hides all-profiles mode, ensures the profile gateway,
  scopes REST helpers, and requests a fresh draft.

Rail/session-list cosmetics are stored locally under `bitch.desktop.profileOrder`
and `bitch.desktop.showAllProfiles`; unused per-profile color overrides were
removed so the store only persists active UI state.

### Gateway registry

[`src/lib/stores/gateway.svelte.ts`](../../src/lib/stores/gateway.svelte.ts)
keeps a `profile → HermesGateway` registry. `ensureGatewayForProfile(profile)`
opens or reuses the socket for that profile, marks the selected gateway active,
and exposes `$gatewaySwapTarget` state for the app-shell swap overlay.

The registry fans gateway events from every open profile socket into
`messages.svelte.ts`, so background profile turns, tool progress, and blocking
prompt requests continue to render under their stored session keys while another
profile is active.

`HermesGateway` and `TauriGatewaySocket` both carry the selected profile down to
Tauri when opening `/api/ws`.

### Session store

[`src/lib/stores/session.svelte.ts`](../../src/lib/stores/session.svelte.ts) is
profile-aware for list, hydration, and mutations:

- List calls prefer `/api/profiles/sessions` and pass `profile` when scoped.
- Existing `/api/sessions` remains as a fallback for older backends.
- Create, select, resume, rename, archive, delete, and history hydration resolve
  the session's owning profile before touching REST or live RPC.
- `messages.svelte.ts` and `session/resume.ts` pass profile through stored message
  hydration so history reads hit the right dashboard host.

### Composer and prompt responses

[`src/lib/stores/composer.svelte.ts`](../../src/lib/stores/composer.svelte.ts)
routes live RPCs through the owning profile before calling `commands.catalog`,
`session.interrupt`, and `prompt.submit`. The `/profile` slash command is
handled locally in Desktop so status reflects the session/new-chat profile
instead of the backend process-global default, while `/profile <name>` updates
the next new-chat profile and ensures that profile's gateway before a new chat
sends. New sessions still pass the selected profile into `session.create` so
the gateway persists the row in the correct profile state database.

[`src/lib/stores/prompts.svelte.ts`](../../src/lib/stores/prompts.svelte.ts)
keeps clarify, approval, sudo, and secret responses profile-scoped. Sudo and
secret prompt events now remember the stored session key, allowing modal responses
to switch to the owning profile before sending `sudo.respond` or `secret.respond`.

## UI

[`src/app/agent/sidebar/ProfileFilterDialog.svelte`](../../src/app/agent/sidebar/ProfileFilterDialog.svelte)
adds the profile filter at the sidebar header. It is hidden for single-profile
users and shows:

- An `all` control for unified history browsing.
- One filter option per profile, sorted by default profile first and then local
  profile order.
- A `group by profile` toggle for all-profile history browsing.

[`Sidebar.svelte`](../../src/app/agent/sidebar/Sidebar.svelte) groups recent sessions
by profile when the all-profiles scope is active and keeps normal scoped recents
unchanged otherwise.

## Remote setup pattern

Run one Hermes dashboard per profile, each on a different port, then save profile
connection overrides:

```bash
hermes --profile default dashboard --port 9119
hermes --profile crypto dashboard --port 9121
hermes --profile research dashboard --port 9122
```

```json
{
  "mode": "remote",
  "url": "http://127.0.0.1:9119",
  "token": "[REDACTED]",
  "profiles": {
    "crypto": { "mode": "remote", "url": "http://127.0.0.1:9121", "token": "[REDACTED]" },
    "research": { "mode": "remote", "url": "http://127.0.0.1:9122", "token": "[REDACTED]" }
  }
}
```

## Known constraints

- **Same URL, multiple profiles:** history can be scoped through
  `/api/profiles/sessions?profile=...`, but live WebSocket chat still executes in
  the profile that backend process booted with. Use one backend per profile.
- **OAuth remote gateways:** per-profile overrides are token-first in this pass.
- **Profile administration UI:** create/rename/delete/SOUL editor routes are not
  ported yet, so the renderer keeps only the profile list/scope types used by
  the current UI.

## Tests

Focused coverage added:

- `connection-config.test.ts` — URL normalization, profile override filtering,
  auth-mode defaults.
- `profile.svelte.test.ts` — profile key normalization, switch serialization,
  and scope derivation.
- `session.svelte.test.ts` — profile-aware creation, resume, stale close, and
  `profile_totals` pagination behavior.
- `composer.svelte.test.ts`, `messages.svelte.test.ts`, and
  `prompts.svelte.test.ts` — profile-scoped live RPC payloads, cross-profile
  stream handling, and blocking prompt responses.
- Rust unit tests in `src-tauri/src/lib.rs` — connection URL normalization,
  profile override resolution, and connection scope key behavior.

## Upstream references

- [types/hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/types/hermes.ts)
- [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts)
- [store/profile.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/profile.ts)
- [store/gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/gateway.ts)
- [profile-switcher.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/profile-switcher.tsx)
- [upstream issue #37713](https://github.com/NousResearch/hermes-agent/issues/37713)
