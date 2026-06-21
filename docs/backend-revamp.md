# Backend Revamp Plan

> **For Hermes:** This is a compatibility-preserving architecture plan. Do not reintroduce local Hermes bootstrap logic, public file-server URL derivation, renderer-held dashboard secrets, or browser-authenticated Hermes calls.

**Goal:** Reorganize backend-backed renderer modules and the Tauri bridge around agent-friendly Clean MVVM boundaries. `monitoring` stays a standalone feature because it talks to Beszel and does not depend on Hermes. Hermes-backed capabilities move under a single Hermes integration boundary with nested features for sessions, threads, files, gateway/runtime, profiles, composer, prompts, and related message orchestration.

**Architecture:** Feature-first Clean MVVM with Ports & Adapters. Svelte pages/components are Views, Svelte rune stores are ViewModels, feature application modules expose use cases, domain modules stay pure, ports describe external capabilities, and adapters call Tauri/Hermes/Beszel/browser APIs. Token-sensitive work remains in the Tauri bridge.

**Tech Stack:** Svelte 5, TypeScript, Tauri `invoke`, Rust bridge modules, authenticated Hermes dashboard routes, Hermes JSON-RPC gateway, Beszel/PocketBase monitoring APIs, colocated Vitest/source-contract tests.

---

## Compatibility contract

1. The desktop app remains remote-only. Do not add local Hermes process startup, local dashboard bootstrapping, or local filesystem shortcuts unless explicitly requested.
2. Hermes dashboard auth stays behind Tauri. The renderer must not read or transmit `HERMES_DASHBOARD_SESSION_TOKEN` directly.
3. Hermes filesystem preview/assets continue to use authenticated dashboard filesystem routes through the Tauri bridge.
4. Hermes gateway runtime traffic continues through the Tauri WebSocket shim and upstream-compatible JSON-RPC client behavior.
5. Monitoring is independent from Hermes. It may share generic platform helpers, but it must not import Hermes sessions, gateway, files, or dashboard modules.
6. `MONITORING_*` env values configure Beszel only. `HERMES_DASHBOARD_*` env values configure Hermes only.
7. Public app navigation remains `AGENT`, `ASSETS`, and `CALENDAR`; do not reintroduce `CMD`, `Files`, or desktop-qualified branding.

## Target module map

```text
src/lib/
  hermes/
    README.md
    index.ts

    shared/
      domain/
      ports/
      adapters/
      types/

    gateway/
      domain/
      application/
      ports/
      adapters/
      index.ts

    sessions/
      domain/
      application/
      ports/
      adapters/
      view-models/
      index.ts

    threads/
      domain/
      application/
      ports/
      adapters/
      view-models/
      index.ts

    files/
      domain/
      application/
      ports/
      adapters/
      index.ts

    profiles/
      domain/
      application/
      ports/
      adapters/
      view-models/
      index.ts

    composer/
      domain/
      application/
      view-models/
      index.ts

    prompts/
      domain/
      application/
      view-models/
      index.ts

  monitoring/
    README.md
    index.ts
    domain/
    application/
    ports/
    adapters/
    view-models/

  platform/
    tauri/
    storage/
    notifications/
    ui/

  shared/
    errors/
    layout/
    types/
```

This is the destination shape, not a required single PR. The migration should be incremental and keep source-compatible barrel exports during transition.

## Feature ownership

| Feature/module                    | Owner boundary                                 | Reason                                                                                      |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Hermes gateway / JSON-RPC         | `src/lib/hermes/gateway`                       | Hermes runtime transport and socket semantics.                                              |
| Sessions                          | `src/lib/hermes/sessions`                      | Session ids, resume, sidebar identity, lifecycle, archive/delete, runtime mapping.          |
| Threads/messages                  | `src/lib/hermes/threads`                       | Conversation transcript normalization, thread preview, canvas extraction, media extraction. |
| Remote files/assets               | `src/lib/hermes/files`                         | Hermes-backed remote filesystem, preview classification, authenticated file/media routes.   |
| Profiles                          | `src/lib/hermes/profiles`                      | Hermes dashboard profiles and selected profile state.                                       |
| Composer                          | `src/lib/hermes/composer`                      | Prompt submission, slash commands, MCP reload orchestration, model selection behavior.      |
| Prompts                           | `src/lib/hermes/prompts`                       | Clarification/approval prompts and prompt-response state.                                   |
| Monitoring                        | `src/lib/monitoring`                           | Standalone Beszel integration; no Hermes dependency.                                        |
| Tauri bridge helpers              | `src/lib/platform/tauri` and `src-tauri/src/*` | Privileged desktop bridge and command adapters.                                             |
| Storage/notifications/UI behavior | `src/lib/platform/*` or `src/lib/shared/*`     | Generic platform capabilities not owned by Hermes or monitoring.                            |

## Dependency rules

```text
src/app Views
  -> ViewModels / public feature APIs

ViewModels
  -> application use cases

application
  -> domain + ports

domain
  -> no Svelte, no Tauri, no browser globals, no network

adapters
  -> ports + Tauri/Hermes/Beszel/browser APIs
```

Rules to enforce over time:

- External app code imports from public module entrypoints, for example `$lib/hermes/files`, `$lib/hermes/sessions`, or `$lib/monitoring`.
- Avoid external deep imports such as `$lib/hermes/files/domain/preview` outside tests or the same feature module.
- Svelte components do not import `@tauri-apps/api/core` directly.
- Hermes features may depend on `hermes/shared`, but `monitoring` must not depend on `hermes/*`.
- Generic `shared` and `platform` modules must not depend on feature modules.
- Domain files must be pure and independently testable.

## Backend bridge target

Split the current Rust bridge by external system and responsibility while preserving the public Tauri command surface during migration.

```text
src-tauri/src/
  lib.rs
  config.rs
  errors.rs

  hermes/
    mod.rs
    config.rs
    auth.rs
    dashboard_http.rs
    gateway_ws.rs
    files.rs

  monitoring/
    mod.rs
    config.rs
    auth.rs
    beszel.rs

  commands/
    mod.rs
    dashboard.rs
    gateway.rs
    monitoring.rs
```

Bridge rules:

- `hermes/*` owns `HERMES_DASHBOARD_URL`, `HERMES_DASHBOARD_SESSION_TOKEN`, dashboard status probing, ws-ticket minting, dashboard HTTP proxying, and gateway WebSocket proxying.
- `monitoring/*` owns `MONITORING_URL`, `MONITORING_SYSTEM_ID`, `MONITORING_EMAIL`, `MONITORING_PASSWORD`, `MONITORING_AUTH_TOKEN`, `MONITORING_IDENTITY`, Beszel login, cached token refresh, and metrics requests.
- `commands/*` exposes stable Tauri command wrappers so renderer migrations do not require a breaking command rename.
- Shared config/error helpers must not know Hermes or Beszel route details.

## Public API examples

Hermes-backed features:

```ts
import { createHermesGateway } from '$lib/hermes/gateway'
import { listRemoteDirectory, classifyFilePreview } from '$lib/hermes/files'
import { resumeHermesSession } from '$lib/hermes/sessions'
import { extractThreadCanvases } from '$lib/hermes/threads'
```

Standalone monitoring:

```ts
import { getHostMetrics, monitoringConfig } from '$lib/monitoring'
```

Components should prefer ViewModels/stores when UI state is involved:

```ts
import { useSessionViewModel } from '$lib/hermes/sessions'
import { useMonitoringViewModel } from '$lib/monitoring'
```

## Implementation slices

### 01 — Establish module contracts

- Add `index.ts` entrypoints for existing modules before moving internals.
- Add `README.md` files for `hermes`, `monitoring`, and major Hermes subfeatures.
- Add transitional re-export files so current imports can be migrated safely.
- Document import rules in `AGENTS.md` after the first working slice lands.

Acceptance tests:

- Existing tests pass without behavior changes.
- New barrel exports are covered by at least one import smoke test or existing consumer test.
- No renderer component imports Tauri directly except approved platform adapter boundaries.

### 02 — Move Hermes files under `hermes/files`

- Move current `src/lib/files` into `src/lib/hermes/files`.
- Split internals into:
  - `domain/preview.ts`
  - `domain/media.ts`
  - `domain/types.ts`
  - `ports/remote-files-port.ts`
  - `ports/local-files-port.ts`
  - `adapters/hermes-remote-files-adapter.ts`
  - `application/list-remote-directory.ts`
  - `application/resolve-file-preview.ts`
- Keep `local` as a placeholder port/adapter only; do not implement local filesystem behavior.
- Update Assets page, thread media rendering, and preview sidebar imports to use `$lib/hermes/files`.

Acceptance tests:

- Remote file list/read/data-url helpers still call authenticated dashboard routes.
- Raw absolute paths remain inert.
- `@file:` and `MEDIA:` behavior remains compatible with the Hermes remote file plan.

### 03 — Move Hermes gateway/session/thread runtime features

- Move gateway transport to `src/lib/hermes/gateway` while preserving the upstream-copied JSON-RPC client note.
- Move session lifecycle/resume/sidebar helpers to `src/lib/hermes/sessions`.
- Move thread canvas/preview/message normalization to `src/lib/hermes/threads`.
- Keep stores as ViewModels, either colocated under feature `view-models/` or re-exported from legacy `src/lib/stores` during transition.
- Define ports for gateway runtime calls, dashboard session listing, session resume, and prompt submission where useful.

Acceptance tests:

- Session route ids remain stored ids; runtime ids remain gateway/live ids.
- Resume fallback and stale runtime recovery still work.
- Message, media, and canvas extraction tests pass after relocation.

### 04 — Move composer, prompts, and profiles into Hermes

- Move slash commands and composer orchestration under `src/lib/hermes/composer`.
- Move prompt approval/clarification logic under `src/lib/hermes/prompts`.
- Move profile config/state helpers under `src/lib/hermes/profiles`.
- Keep UI components in `src/app/components`; only non-visual feature logic moves.

Acceptance tests:

- Composer submit, slash command, model picker, MCP reload, and prompt response behavior remain unchanged.
- Profile selection and gateway connection fallback still respect `HERMES_DASHBOARD_URL` through Tauri, not Vite env exposure.

### 05 — Formalize standalone monitoring

- Keep `src/lib/monitoring` top-level.
- Split into:
  - `domain/metrics.ts`
  - `domain/normalize.ts`
  - `domain/format.ts`
  - `ports/monitoring-port.ts`
  - `adapters/beszel-monitoring-adapter.ts`
  - `application/get-host-metrics.ts`
  - `view-models/monitoring.svelte.ts` if state becomes feature-local.
- Ensure no imports from `src/lib/hermes/*`.
- Keep Beszel token generation/caching in Rust.

Acceptance tests:

- `MONITORING_URL` normalization remains scheme/host/port only.
- `MONITORING_SYSTEM_ID` may come from env or `/system/:id` URL path.
- Password auth and static token auth behavior remain covered by Rust tests.

### 06 — Split Rust Tauri bridge modules

- Move Hermes config/auth/dashboard/gateway/file helpers out of the monolithic bridge into `src-tauri/src/hermes/*`.
- Move Beszel monitoring config/auth/request helpers into `src-tauri/src/monitoring/*`.
- Keep command names stable until all renderer consumers are migrated.
- Add focused Rust tests around URL normalization, route validation, token refresh, ws-ticket use, and Beszel auth.

Acceptance tests:

- `cargo check` passes through the repo-local wrapper.
- Existing Tauri commands remain callable by the renderer.
- No env var regressions: Hermes reads only `HERMES_DASHBOARD_*`; monitoring reads only `MONITORING_*`.

### 07 — Enforce architecture boundaries

- Add lint/import restrictions after migrations stabilize.
- Forbid app-level deep imports into feature internals.
- Forbid Tauri imports outside adapters/platform modules.
- Forbid monitoring-to-Hermes imports.
- Add source-contract tests or static checks for critical boundaries if ESLint alone is insufficient.

Acceptance tests:

- Boundary rules fail on intentional bad imports.
- Existing app imports use public feature entrypoints.

## Migration gates

Each slice should be a behavior-preserving PR unless explicitly scoped otherwise.

For renderer-affecting slices, run:

```bash
npm run type-check
npm run lint
npm test
npm run frontend:build
```

For Rust/Tauri-affecting slices, run:

```bash
bash scripts/rust-wrapper.sh cargo check --manifest-path src-tauri/Cargo.toml
```

For dependency changes, additionally run:

```bash
npm audit
bash scripts/rust-wrapper.sh cargo audit --manifest-path src-tauri/Cargo.toml
```

## Proof standard

The revamp is complete when:

- `monitoring` is standalone and has no Hermes imports.
- Hermes-backed sessions, threads, files, gateway, composer, prompts, and profiles live under `src/lib/hermes/*` or are publicly re-exported from there.
- App code imports feature APIs through module entrypoints rather than internal implementation files.
- Renderer code does not own Hermes dashboard secrets or Beszel credentials.
- Rust bridge modules are split by Hermes vs monitoring responsibility without changing the external app contract.
- The standard renderer and Rust validation stacks pass.

## Non-goals

- No local Hermes bootstrap.
- No public unauthenticated file server.
- No rewrite of Svelte UI components into a different UI architecture.
- No dependency changes unless a slice explicitly requires them.
- No broad feature redesign while moving files; behavior changes should be separate, intentional follow-up work.
