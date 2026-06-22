# AGENTS.md — BITCH

## Purpose

BITCH is a minimal Tauri + Svelte client for Hermes remote dashboard gateway access.
Keep the repo remote-only and do not reintroduce local Hermes bootstrap logic unless the user explicitly asks.

## Current app shape

- The Svelte renderer creates a `HermesGateway` from `src/lib/hermes/gateway/hermes.ts`; gateway registry state lives under `src/lib/hermes/gateway/view-models/`.
- Hermes-backed composer orchestration, slash-command dispatch, prompt response state, profile switching, sessions, threads, remote files, dashboard plugin APIs, Cron, and Kanban helpers live under `src/lib/hermes/*` public entrypoints.
- Beszel host telemetry lives under the standalone `src/lib/monitoring/*` lane and must not import Hermes modules.
- Native renderer helpers live under `src/lib/platform/*`; renderer components and feature modules should not import `@tauri-apps/api/*` directly.
- `HermesGateway` extends the upstream-compatible `JsonRpcGatewayClient` and uses `createTauriGatewaySocket` from `src/lib/hermes/gateway/tauri-gateway-socket.ts`.
- The Tauri Rust bridge is split into `src-tauri/src/{hermes,monitoring,platform}` lane modules plus shared `config.rs`, `errors.rs`, and `http.rs` helpers. `src-tauri/src/commands/*` preserves stable invoke command wrappers for the renderer.
- Do not assume the browser can set the auth headers the Hermes gateway or Beszel hub expects; keep token-sensitive auth in the Tauri bridge.

## Renderer organization

Keep the Svelte app organized around page folders plus shared app components:

- Page folders live directly under `src/app/`:
  - `src/app/main`
  - `src/app/agent`
  - `src/app/assets`
  - `src/app/calendar`
- Shared renderer components live under `src/app/components/`; do not recreate `src/components/`.
  - Shared UI primitives are in `src/app/components/ui/` and should be imported with `@/app/components/ui/...`.
  - Shared chat surfaces are in `src/app/components/composer/` and `src/app/components/thread/`; keep `Composer` (including the model picker) and `Thread` reusable across pages.
  - Shared prompt components live in `src/app/components/prompts/`.
- Page-only components stay inside their page folder. Name them with the page prefix/title when they are not intended to be shared, for example `MainAgentPanel`, `MainRenderPanel`, `AgentSessionSidebar`, and `AgentPreviewSidebar`.
- The session sidebar belongs under the AGENT page at `src/app/agent/session-sidebar/`; do not move it back into shared components unless it becomes genuinely page-agnostic.
- Canonical user-facing tabs/routes are `AGENT` (`/agent`), `ASSETS` (`/assets`), and `CALENDAR` (`/calendar`). Legacy `/cmd` and `/files` parsing may remain only for backward compatibility; do not surface `CMD` or `Files` as tab/page branding.
- Avoid reintroducing `Geo` in local app component names or app-owned identifiers. Use render/shape wording such as `MainRenderPanel`, `MainRenderScene`, `cpuShape`, and `memoryShape`; external library API names such as Three.js geometry classes are fine when required.

## Configuration

The app uses these environment values, usually from `.env` copied from `.env.example`:

- `HERMES_DASHBOARD_URL` — Hermes dashboard HTTP origin. Defaults to `http://127.0.0.1:9119` when unset.
- `HERMES_DASHBOARD_SESSION_TOKEN` — Hermes dashboard session token used by the Tauri bridge.
- `MONITORING_URL` — Beszel hub HTTP origin for the main dashboard monitoring panel. Defaults to `http://homestation:8090` when unset. Include scheme and port in this one URL; do not add a separate monitoring port variable.

Remote file preview, inline media, and the Assets page must use authenticated Hermes dashboard filesystem routes through the Tauri bridge. Do not add public file-server origins, root-specific URL derivation, or desktop-local file syntax. File/filesystem wording is still appropriate when describing remote filesystem APIs or actual remote file entries.

Do not reintroduce stale gateway variables such as `BITCH_GATEWAY_URL`, `VITE_BITCH_GATEWAY_URL`, or `VITE_BITCH_GATEWAY_WS_URL` unless the runtime code is intentionally changed to use them.

## Renderer import rules

The backend revamp uses explicit Clean MVVM / Ports & Adapters lanes. Prefer public lane entrypoints over deep imports when adding new code:

- Hermes dashboard/runtime work goes through `$lib/hermes/...` facades. Legacy top-level compatibility paths such as `$lib/api`, `$lib/gateway`, `$lib/files`, `$lib/session`, `$lib/thread`, `$lib/messages`, `$lib/composer`, and `$lib/stores/*` have been removed; do not reintroduce them.
- Beszel/host telemetry goes through `$lib/monitoring` and must not import Hermes dashboard, gateway, files, sessions, or plugin helpers. Monitoring credentials and token refresh must stay behind Tauri.
- Native app utilities go through `$lib/platform`; renderer components and feature modules must not import `@tauri-apps/api/core` directly. Direct Tauri API imports are approved only inside platform adapter boundaries.
- Shared renderer utilities under `src/lib/{errors,layout,notifications,platform,storage,types,ui}` must not import feature lanes.
- Future non-Hermes services such as CalDAV should get their own lane instead of tunneling through `dashboard_request`.

## Creating or extending backend-backed features

Use the root [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/README.md`](docs/README.md) before changing hierarchy. The quick decision tree:

1. Hermes dashboard/runtime, sessions, files, gateway, prompts, profiles, Cron, or Kanban work belongs in `src/lib/hermes/*` and `src-tauri/src/hermes/*`.
2. Beszel/host telemetry belongs in `src/lib/monitoring/*` and `src-tauri/src/monitoring/*`; it must not import Hermes and must not use `dashboard_request`.
3. Native desktop utilities belong in `src/lib/platform/*` and `src-tauri/src/platform/*`; platform modules must not know Hermes or Beszel route details.
4. A separate external service, for example CalDAV, needs a new lane (`src/lib/<feature>/*`, `src-tauri/src/<feature>/*`, and `src-tauri/src/commands/<feature>.rs`) instead of abusing the Hermes dashboard bridge.
5. Pure formatting, parsing, and normalization should stay in TypeScript `domain` or `application` modules unless privileged native access is required.

When adding or moving a feature:

- Add or update the public `index.ts` entrypoint first.
- Prefer same-PR call-site migration over re-export shims; if a temporary shim is unavoidable, remove it once source search proves consumers are gone.
- Put UI state in ViewModels, orchestration in `application`, pure rules in `domain`, external contracts in `ports`, and Tauri/Hermes/Beszel calls in `adapters`.
- Add or update source-contract tests such as `src/lib/architecture-boundaries.test.ts`, `src/lib/rust-bridge-lanes.test.ts`, or a lane-local boundary test when the import rules change.
- Update the relevant feature doc under `docs/` and the root `ARCHITECTURE.md` in the same PR as hierarchy changes. Stale architecture docs are just ruins with nicer typography.

## Current upstream copy

The only file currently copied from the official Hermes repo is:

- `src/lib/hermes/gateway/json-rpc-gateway.ts` ← copied from `NousResearch/hermes-agent`:
  `apps/shared/src/json-rpc-gateway.ts`

The local copy is formatted with this repo's Prettier config, so raw bytes may differ from upstream while the formatted source should have zero semantic diff. Knip suppresses unused-export findings for this vendored file so upstream's public type surface is not stripped locally.

Everything else in this repo is local glue or Tauri-specific wiring unless the file header says otherwise.

If you later decide to copy more upstream code, add it here explicitly and keep the list current.

## Validation expectations

When a change touches the renderer, run:

```bash
npm run type-check
npm run lint
npm run frontend:build
```

When a change touches Rust/Tauri code, use the repo-local wrapper if global Cargo is unavailable:

```bash
bash scripts/rust-wrapper.sh cargo check --manifest-path src-tauri/Cargo.toml
```

When a change adds or updates dependencies (npm or Cargo), run the security checks below and fix findings before finishing the task.

## Dependency security

The repo must stay at **zero reported vulnerabilities** for both JavaScript and Rust dependency trees.

### npm

Run a clean audit after any `package.json` / lockfile change:

```bash
npm audit
```

- Do not merge or ship work that leaves `npm audit` reporting moderate, high, or critical issues.
- Prefer upgrading or replacing affected packages over `--force` or audit suppressions.
- If a finding is a false positive or has no fix yet, document the exception in the PR with upstream links and a removal plan; do not silently ignore audit output.

### Rust

Use the repo-local Cargo wrapper and `cargo-audit` (install once if missing: `cargo install cargo-audit`):

```bash
bash scripts/rust-wrapper.sh cargo audit --manifest-path src-tauri/Cargo.toml
```

- Treat `cargo audit` advisories like `npm audit` findings: resolve to zero, or document a time-bounded exception with rationale.
- After dependency bumps in `src-tauri/Cargo.toml`, re-run `cargo check` and `cargo audit` together.

## Testing

Write tests when they materially improve stability — especially for gateway wiring, auth/session handling, JSON-RPC transport behavior, and Tauri bridge logic that is easy to regress.

- Add or extend tests alongside behavior changes; do not land features or fixes without coverage when a reasonable automated check exists.
- Prefer focused unit tests on pure TypeScript/Rust helpers; use integration-style checks only where they catch real cross-layer failures.
- Keep tests runnable in CI: document the command in the PR if a new script is added (for example `npm test` or `bash scripts/rust-wrapper.sh cargo test --manifest-path src-tauri/Cargo.toml`).
- Do not add test frameworks or debug-only harnesses unless the tests they enable are maintained and run as part of normal validation.

## Repo-local Rust setup

The Tauri scripts are wrapped so Rust state stays in `.cargo/` and `.rustup/` inside the repo.

- `npm run setup:rust` — preinstall the repo-local Rust toolchain.
- `npm run dev` — run Tauri dev through `scripts/rust-wrapper.sh`.
- `npm run build` — build Tauri through `scripts/rust-wrapper.sh`.

macOS still needs Xcode Command Line Tools.

## Guardrails

- Keep `commitlint.config.cjs` in CommonJS format.
- Keep Husky hooks simple.
- Keep the repo remote-only; avoid local Hermes bootstrap code unless the user asks for it.
- UI-facing branding must say `BITCH` only; do not show legacy desktop-qualified names in the interface.
- UI-facing navigation must say `AGENT`, `ASSETS`, and `CALENDAR`; do not reintroduce `CMD` or `Files` tab/page labels.
- Use Bits UI for Svelte renderer UI primitives and components whenever you add or refactor interface elements.
- Use Tailwind utility classes and layers for renderer styling; avoid bespoke CSS rules unless you need a global base reset or a shared theme token.
- Keep `npm audit` and `cargo audit` at zero vulnerabilities; dependency changes are incomplete until both pass.
- Add tests that improve stability; skip only when automation cannot meaningfully exercise the change.
