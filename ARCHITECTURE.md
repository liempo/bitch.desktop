# BITCH architecture

BITCH is a remote-only Tauri + Svelte desktop client for Hermes dashboard and
runtime access. The renderer owns views, local presentation state, and pure
feature orchestration. The Tauri backend owns privileged desktop capabilities,
Hermes dashboard authentication, WebSocket setup, filesystem/media proxying, and
Beszel credential use. The app must not start a local Hermes server or route
privileged secrets through the browser renderer unless the maintainer explicitly
changes that product contract.

The backend revamp splits the codebase by external-system lane and by Clean MVVM
/ Ports & Adapters responsibilities. The split is intentionally boring. Boring
is what keeps the glass box from filling with smoke.

## Top-level runtime shape

```text
src/app/                  Svelte routes, page views, and shared UI components
src/lib/hermes/           Hermes dashboard/runtime lane
src/lib/monitoring/       Standalone Beszel/PocketBase host telemetry lane
src/lib/platform/         Renderer adapter boundary for native Tauri helpers
src/lib/{errors,layout,
  notifications,storage,
  types,ui}/              Shared renderer utilities and layout state, no feature-lane imports
src-tauri/src/hermes/     Rust Hermes dashboard, auth, files, and gateway lane
src-tauri/src/monitoring/ Rust monitoring/Beszel lane
src-tauri/src/platform/   Rust native desktop helpers
src-tauri/src/commands/   Stable Tauri command wrappers
src-tauri/src/{config,
  errors,http}.rs         Shared Rust helpers with no lane-specific routes
```

Renderer pages import feature entrypoints and ViewModels; feature code imports
application/domain/ports/adapters inside its own lane; Rust commands preserve the
public Tauri command surface while delegating to lane modules.

## Clean MVVM and Ports & Adapters rules

The renderer follows this dependency direction:

```text
Svelte views (`src/app/**`)
  -> ViewModels and public feature entrypoints
ViewModels
  -> application use cases
application
  -> domain + ports
adapters
  -> ports + platform/Tauri/Hermes/Beszel APIs
domain
  -> pure TypeScript only
```

Domain modules must not import Svelte, Tauri APIs, browser globals, localStorage,
network clients, or feature adapters. App views should not deep-import feature
internals such as `domain`, `application`, `adapters`, `ports`, or
`view-models`; use the nearest public `index.ts` facade instead. Tests may import
internals when the internal behavior is the unit under test.

## Backend lane model

A lane is an external system or native responsibility with its own configuration,
auth, adapter, command surface, and tests. A feature that talks to a different
external system gets a lane of its own instead of borrowing Hermes dashboard
plumbing because it happens to be nearby and unsupervised.

| Lane       | Owns                                                                                                                                                            | Must not own                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Hermes     | Dashboard `/api/*` requests, authenticated remote files/media, JSON-RPC runtime gateway, ws-ticket/session-token handling, profile-scoped dashboard/plugin APIs | Beszel/monitoring, generic native helpers, non-Hermes services |
| Monitoring | Beszel/PocketBase host telemetry, `MONITORING_*` config, system selection, token refresh, metrics reads                                                         | Hermes dashboard/session/files/gateway/plugin modules          |
| Platform   | Native app helpers: connection config storage, external URL opening, notifications, window setup, generic invoke/event wrappers                                 | Product backend route knowledge for Hermes or Beszel           |
| Shared     | Pure utilities such as errors, layout helpers, UI helpers, typed DTOs, storage namespace helpers                                                                | Feature-lane imports or privileged backend calls               |

`dashboard_request` is Hermes-only. It is path-validated to Hermes dashboard
`/api/*` routes and must not become a generic proxy for Beszel, CalDAV, or any
future service. Future integrations add their own lane and command wrapper.

## Hermes renderer lane: `src/lib/hermes/*`

`src/lib/hermes` is the renderer facade for Hermes dashboard and runtime
concerns. It contains nested feature modules because all of these capabilities
share the same remote Hermes integration boundary.

```text
src/lib/hermes/
  index.ts
  README.md
  shared/adapters/dashboard-api-client.ts
  dashboard/     shared dashboard REST client and plugin exports
  cron/          Hermes dashboard Cron plugin helpers
  kanban/        Hermes dashboard Kanban plugin helpers
  gateway/       JSON-RPC client, Tauri WebSocket shim, runtime ports/ViewModel
  sessions/      session resume, sidebar loading, lifecycle ports/ViewModel
  threads/       message ViewModel, normalization, previews, canvas and media extraction
  files/         remote filesystem preview, media, attachment ports/adapters
  profiles/      profile selection and profile-scoped routing ViewModel
  composer/      slash commands, queueing, attachment relay, prompt submission
  prompts/       clarify/approval/sudo/secret prompt state and responses
```

Hermes source may use `hermes/shared` and platform adapters. It must not import
monitoring modules, read `MONITORING_*` configuration, mention Beszel, or route
through monitoring commands. Token-sensitive Hermes work stays behind Tauri: the
renderer does not read `HERMES_DASHBOARD_SESSION_TOKEN`, mint WebSocket tickets,
or attach dashboard auth headers directly.

Legacy top-level feature barrels and stores were removed after call sites migrated.
New code must import `$lib/hermes/...` public entrypoints directly rather than
reintroducing `$lib/api`, `$lib/files`, `$lib/gateway`, `$lib/session`,
`$lib/thread`, `$lib/messages`, `$lib/composer`, or `$lib/stores/*` shims.

## Monitoring renderer lane: `src/lib/monitoring/*`

`src/lib/monitoring` is standalone host telemetry backed by Beszel/PocketBase. It
is not a Hermes plugin and must not import Hermes sessions, gateway, files,
dashboard clients, composer state, or plugin helpers.

```text
src/lib/monitoring/
  index.ts
  README.md
  domain/metrics.ts
  domain/normalize.ts
  domain/format.ts
  ports/monitoring-port.ts
  adapters/beszel-monitoring-adapter.ts
  application/get-host-metrics.ts
  lane-boundary.test.ts
```

The renderer receives only explicit monitoring config exposed by the Vite define
bridge and calls the `host_monitor_request` Tauri command through the monitoring
adapter. Beszel passwords, static tokens, cached auth tokens, and CORS-sensitive
requests stay in the Rust monitoring lane. Monitoring never calls
`dashboard_request`.

## Platform renderer lane: `src/lib/platform/*`

`src/lib/platform` wraps native Tauri capabilities for renderer code. It is a
platform boundary, not a product backend lane.

Current public helpers include:

- `invokeTauriCommand` for typed Tauri command invocation;
- `listenTauriEvent` for typed Tauri event subscriptions;
- `openExternalUrl` for opening external HTTP(S) links through the native bridge.

Feature modules and Svelte components should import these helpers or a
feature-specific adapter instead of importing `@tauri-apps/api/*` directly.
Direct `@tauri-apps/api/core` imports belong in platform/adapter boundaries or
in tests. Platform helpers must not hardcode Hermes dashboard, Beszel, or future
service routes.

## Rust bridge lanes

The Tauri bridge mirrors the renderer lane split while keeping stable command
wrappers for the renderer.

```text
src-tauri/src/
  lib.rs             app builder, plugin registration, invoke handler only
  main.rs            Tauri entrypoint
  config.rs          generic env/.env/config helpers, no route details
  errors.rs          shared error/result helpers
  http.rs            generic reqwest client/response helpers
  hermes/
    mod.rs
    config.rs        HERMES_DASHBOARD_* / BITCH_DASHBOARD_* compatibility
    auth.rs          dashboard auth headers and ws-ticket/session-token rules
    dashboard_http.rs Hermes-only /api/* proxying for dashboard_request
    files.rs         authenticated Hermes file/media routes
    gateway_ws.rs    native WebSocket proxy for Hermes JSON-RPC runtime
  monitoring/
    mod.rs
    config.rs        MONITORING_* configuration
    auth.rs          Beszel static/password auth and cached token refresh
    beszel.rs        PocketBase systems/system_stats reads
  platform/
    mod.rs
    window.rs
    external_url.rs
    notifications.rs
  commands/
    mod.rs
    config.rs
    dashboard.rs
    gateway.rs
    monitoring.rs
    platform.rs
```

`commands/*` files are the stable invoke facade. They should be thin wrappers
that call lane modules; moving implementation details behind them must not break
renderer command names. Shared Rust helpers (`config`, `errors`, `http`) must not
know Hermes dashboard routes, Beszel collection paths, or platform-specific
window behavior.

## Future backend lanes

Non-Hermes integrations add their own lane. For example, CalDAV should look like
this instead of using `dashboard_request`:

```text
src/lib/calendar/
  domain/
  application/
  ports/
  adapters/
  view-models/
  index.ts

src-tauri/src/calendar/
  mod.rs
  config.rs
  auth.rs
  caldav.rs

src-tauri/src/commands/calendar.rs
```

Decision rule:

- Hermes dashboard, runtime, files, profiles, sessions, Cron, Kanban, prompts ->
  Hermes lane.
- Beszel and host telemetry -> monitoring lane.
- OS/native utility -> platform lane.
- Separate external service such as CalDAV -> its own lane.
- Pure formatting, parsing, normalization, or local state orchestration ->
  TypeScript domain/application modules unless privileged native access is
  required.

## Source-compatible migration contract

Legacy compatibility shims were removed once source search proved call sites had
migrated. During future hierarchy migrations:

1. Add the new lane entrypoint first.
2. Move internals behind the entrypoint.
3. Prefer same-PR call-site migration over long-lived re-export shims.
4. If a temporary shim is unavoidable, document its removal condition in the PR.
5. Update docs and architecture-boundary tests in the same change that changes
   hierarchy.
6. Remove temporary shims once source search proves no internal or public
   consumer still relies on them.

The only tracked upstream mirror is
`src/lib/hermes/gateway/json-rpc-gateway.ts`, copied from
`NousResearch/hermes-agent/apps/shared/src/json-rpc-gateway.ts`. Other gateway,
Tauri, and type files are BITCH-specific glue unless a checked-in doc says
otherwise.

## Boundary verification

Architecture rules are executable, not just tasteful wall art. Current boundary
checks live in:

- `src/lib/architecture-boundaries.ts`
- `src/lib/architecture-boundaries.test.ts`
- `src/lib/rust-bridge-lanes.test.ts`
- `src/lib/monitoring/lane-boundary.test.ts`

The tests enforce:

- app code uses public feature entrypoints instead of deep feature internals;
- renderer code does not import `@tauri-apps/api/core` outside approved adapter
  boundaries;
- monitoring and Hermes do not import each other or reference each other's env
  variables/route names;
- shared/platform renderer modules do not depend on feature lanes;
- domain modules stay pure;
- Rust Hermes, monitoring, platform, shared helper, and future service lanes do
  not leak concerns across module boundaries;
- future Rust lanes such as `calendar` do not tunnel through Hermes internals.

When the hierarchy changes, update the boundary helper and tests first enough to
make the intended contract fail on the old shape, then make the source and docs
match.

## Documentation map

- [`docs/README.md`](docs/README.md) — feature-organized documentation index.
- [`docs/hermes/README.md`](docs/hermes/README.md) — Hermes lane map and feature
  docs.
- [`docs/monitoring/beszel.md`](docs/monitoring/beszel.md) — monitoring lane and
  Beszel contract.
- [`docs/platform/native-bridge.md`](docs/platform/native-bridge.md) — Tauri
  bridge and platform responsibilities.
- [`docs/shared/backend-revamp.md`](docs/shared/backend-revamp.md) — reusable
  lane conventions and future-feature pattern.
