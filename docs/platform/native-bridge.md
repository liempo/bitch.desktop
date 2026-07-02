# Platform and native bridge

The platform lane owns native desktop capabilities and generic bridge helpers. It
is not a product backend lane. Keep Hermes dashboard routes, Beszel collection
paths, and future service APIs out of platform modules.

## Renderer platform boundary

```text
src/lib/platform/
  index.ts
  README.md
  tauri.ts
```

Current public helpers:

- `invokeTauriCommand` — typed wrapper around Tauri command invocation;
- `listenTauriEvent` — typed wrapper around Tauri event subscriptions;
- `openExternalUrl` — native external URL opening use case.

Renderer components and feature modules should use platform helpers or
feature-specific adapters. Direct `@tauri-apps/api/core` imports are reserved for
platform/adapter boundaries and tests.

## Rust platform boundary

```text
src-tauri/src/
  config.rs
  errors.rs
  http.rs
  platform/
    mod.rs
    window.rs
    external_url.rs
  commands/
    config.rs
    platform.rs
```

Responsibilities:

- window setup and macOS traffic-light behavior;
- external URL opening;
- connection configuration storage;
- generic `~/.bitch/config.yaml` configuration helpers and legacy connection migration;
- generic HTTP client and response helpers;
- shared error/result helpers.

Shared `config.rs`, `errors.rs`, and `http.rs` are reusable utilities. They must
not hardcode Hermes dashboard auth, Beszel tokens, plugin paths, or feature route
knowledge. Feature lanes call these helpers; the helpers do not call feature
lanes back. Recursive ownership is how small programs become habitat studies.

## Stable commands

`src-tauri/src/commands/*` is the renderer-facing command surface. Keep command
names stable while implementations move behind Hermes, monitoring, platform, or
future lane modules. A command wrapper should be thin enough that source-contract
tests can tell which lane owns the real behavior:

- `commands/dashboard.rs` delegates to `hermes::dashboard_http`.
- `commands/gateway.rs` delegates to `hermes::gateway_ws` and Hermes auth/config.
- `commands/monitoring.rs` delegates to `monitoring::beszel`.
- `commands/platform.rs` delegates to `platform::*` modules.
- `commands/config.rs` delegates to generic config/connection helpers.

When adding a new backend integration, add a new lane and command wrapper instead
of broadening `dashboard_request`.
