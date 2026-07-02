# Monitoring / Beszel lane

The monitoring lane is a standalone Beszel/PocketBase integration for monitoring telemetry. It is not a Hermes dashboard plugin and must not import Hermes sessions, files, gateway, dashboard, composer, prompt, Cron, or Kanban modules.

## Renderer boundary

```text
src/lib/monitoring/
  index.ts
  README.md
  domain/metrics.ts
  domain/normalize.ts
  domain/format.ts
  ports/monitoring-port.ts
  adapters/beszel-monitoring-adapter.ts
  application/get-monitoring-metrics.ts

src/lib/tests/monitoring/
  lane-boundary.test.ts
```

Responsibilities:

- normalize `monitoring.url` defaults loaded from `~/.bitch/config.yaml` through the Tauri bridge;
- derive the Beszel system id from `monitoring.systemId` or a `/system/:id` URL when present;
- read PocketBase `systems`, `system_stats`, and `containers` records through the monitoring adapter;
- normalize CPU, memory, disk, load, thermal, uptime, and container rows for the dashboard UI;
- expose public helpers through `$lib/monitoring`.

The renderer receives only non-secret monitoring configuration through `get_monitoring_config`. It should not hold Beszel passwords, static auth tokens, or cached session tokens.

## Rust boundary

```text
src-tauri/src/monitoring/
  mod.rs
  config.rs
  auth.rs
  beszel.rs
src-tauri/src/commands/monitoring.rs
```

Responsibilities:

- own `monitoring` section configuration parsing from `~/.bitch/config.yaml`;
- normalize Beszel/PocketBase base URLs and collection paths;
- use static token auth or email/password auth when configured;
- cache and refresh Beszel tokens behind Tauri;
- expose non-secret monitoring config through `get_monitoring_config` and API reads through `monitoring_request`.

Monitoring must not call Hermes `dashboard_request`. If credentials, CORS, or network policy require privileged handling, add or extend monitoring commands in Rust instead of leaking secrets into the renderer.

## Tests and source contracts

- `src/lib/tests/monitoring/lane-boundary.test.ts` guards renderer isolation.
- `src/lib/tests/support/architecture-boundaries.test.ts` guards monitoring-to-Hermes imports and configuration leaks.
- `src/lib/tests/support/rust-bridge-lanes.test.ts` guards the Rust monitoring lane and command wrappers.

A future telemetry source that is not Beszel should either replace this lane's adapter behind the same monitoring port or create a new lane if it is a separate external system with different auth/config semantics.
