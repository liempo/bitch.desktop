# Backend lane conventions

The backend revamp reorganized BITCH around external-system lanes plus Clean
MVVM / Ports & Adapters. This document is the reusable convention for future
feature work; the complete final architecture lives in
[`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Compatibility contract

1. BITCH remains remote-only. Do not add local Hermes process startup, local
   dashboard bootstrapping, or public file-server URL derivation.
2. Hermes dashboard auth stays behind Tauri. The renderer must not read or
   transmit `HERMES_DASHBOARD_SESSION_TOKEN` directly.
3. Hermes remote file preview and inline media use authenticated dashboard
   filesystem routes through the Tauri bridge.
4. Hermes runtime traffic continues through the Tauri WebSocket shim and the
   upstream-compatible JSON-RPC gateway client.
5. Monitoring is independent from Hermes. It may share generic Rust/renderer
   helpers, but it must not import Hermes sessions, gateway, files, dashboard, or
   plugin modules.
6. `MONITORING_*` config belongs to Beszel/monitoring; `HERMES_DASHBOARD_*`
   config belongs to Hermes.
7. Public app navigation remains `AGENT`, `ASSETS`, and `CALENDAR`.

## Lane decision rule

- Hermes dashboard/runtime route, profile, session, file, Cron, Kanban, prompt,
  or gateway behavior -> Hermes lane.
- Beszel/monitoring telemetry -> monitoring lane.
- OS/native utility -> platform lane.
- Separate external service such as CalDAV -> its own lane.
- Pure normalization/formatting/parsing -> TypeScript domain/application module
  unless privileged native access is required.

`dashboard_request` is Hermes-only and accepts Hermes dashboard `/api/*` routes.
Do not use it as a general-purpose HTTP proxy.

## Clean MVVM dependency direction

```text
src/app views
  -> ViewModels / public feature APIs
ViewModels
  -> application use cases
application
  -> domain + ports
adapters
  -> ports + Tauri/Hermes/Beszel/browser APIs
domain
  -> pure TypeScript
```

External callers should import public feature entrypoints, for example
`$lib/hermes/files`, `$lib/hermes/sessions`, `$lib/hermes/gateway`, or
`$lib/monitoring`. Avoid app-level deep imports into `domain`, `application`,
`adapters`, `ports`, and `view-models`. Tests may import internals when they are
specifically testing internal behavior.

## Source-compatible migration steps

Use this sequence when moving or adding a feature:

1. Add or identify the public lane entrypoint.
2. Write or update a source-contract test that describes the boundary.
3. Move internals into `domain`, `application`, `ports`, `adapters`, or
   `view-models` as appropriate.
4. Migrate app and feature callers to the public entrypoint in the same PR when practical.
5. If a temporary re-export shim is unavoidable, document its removal condition and keep it narrow.
6. Update `ARCHITECTURE.md`, the relevant doc under `docs/`, and `AGENTS.md` if
   the rule should guide future workers.
7. Run focused tests plus the standard validation stack.
8. Remove temporary shims after source search proves they are unused.

## Future lane template

For a future non-Hermes integration such as CalDAV:

```text
src/lib/calendar/
  index.ts
  README.md
  domain/
  application/
  ports/
  adapters/
  view-models/

src-tauri/src/calendar/
  mod.rs
  config.rs
  auth.rs
  caldav.rs

src-tauri/src/commands/calendar.rs
```

Rules for the new lane:

- keep credentials and CORS-sensitive calls behind Tauri;
- expose typed renderer ports/adapters rather than browser fetches that need
  secrets;
- keep shared helpers generic and route-free;
- add boundary tests so the lane cannot import Hermes or monitoring by accident;
- add docs before the next worker has to infer the architecture from scorch
  marks.

## Boundary tests

Architecture rules currently live in:

- `src/lib/architecture-boundaries.ts`
- `src/lib/architecture-boundaries.test.ts`
- `src/lib/rust-bridge-lanes.test.ts`
- `src/lib/monitoring/lane-boundary.test.ts`

Update those tests whenever the lane model changes. If a new rule is important
enough to document, it is important enough to make executable.
