# AGENTS.md — BITCH

## Purpose

BITCH is a minimal Tauri + Svelte client for Hermes remote dashboard gateway access.
Keep the repo remote-only and do not reintroduce local Hermes bootstrap logic unless the user explicitly asks.

## Current app shape

- The Svelte renderer creates a `HermesGateway` from `src/lib/gateway/hermes.ts`.
- `HermesGateway` extends the upstream `JsonRpcGatewayClient` and uses `createTauriGatewaySocket` from `src/lib/gateway/tauri-gateway-socket.ts`.
- The Tauri Rust bridge in `src-tauri/src/lib.rs` resolves gateway config, probes `/api/status`, mints a `/api/auth/ws-ticket` when required, attaches `X-Hermes-Session-Token` when appropriate, and proxies WebSocket frames to the renderer.
- Do not assume the browser can set the auth headers the Hermes gateway expects; keep token-sensitive auth in the Tauri bridge.

## Configuration

The app uses these environment values, usually from `.env` copied from `.env.example`:

- `VITE_HERMES_DASHBOARD_URL` — Hermes dashboard HTTP origin. Defaults to `http://127.0.0.1:9119` when unset.
- `BITCH_DASHBOARD_API_KEY` — Hermes dashboard session token used by the Tauri bridge.

Remote file preview, inline media, and the Files page must use authenticated Hermes dashboard filesystem routes through the Tauri bridge. Do not add public file-server origins, root-specific URL derivation, or desktop-local file syntax.

Do not reintroduce stale gateway variables such as `BITCH_GATEWAY_URL`, `VITE_BITCH_GATEWAY_URL`, or `VITE_BITCH_GATEWAY_WS_URL` unless the runtime code is intentionally changed to use them.

## Current upstream copy

The only file currently synced from the official Hermes repo is:

- `src/lib/gateway/json-rpc-gateway.ts` ← copied from `NousResearch/hermes-agent`:
  `apps/shared/src/json-rpc-gateway.ts`

The sync command normalizes that file with this repo's Prettier config, so raw bytes may differ from upstream while the formatted source should have zero semantic diff. Knip suppresses unused-export findings for this vendored file so upstream's public type surface is not stripped locally.

Everything else in this repo is local glue or Tauri-specific wiring unless the file header says otherwise.

If you later decide to sync more upstream code, add it here explicitly and keep the list current.

## Sync command

Use this command to refresh the copied transport layer from upstream:

```bash
npm run sync:transport
```

That command does a simple file copy only. It does **not** migrate local edits automatically.
After syncing, inspect the diff and manually migrate any API or behavior changes into the local Tauri bridge and UI.

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
- UI-facing branding must say `BITCH` only; do not show `BITCH.DESKTOP`, `bitch.desktop`, or similar desktop-qualified names in the interface.
- Use Bits UI for Svelte renderer UI primitives and components whenever you add or refactor interface elements.
- Use Tailwind utility classes and layers for renderer styling; avoid bespoke CSS rules unless you need a global base reset or a shared theme token.
- Preserve the upstream transport file first when syncing; adapt the local wrapper afterward.
- Keep `npm audit` and `cargo audit` at zero vulnerabilities; dependency changes are incomplete until both pass.
- Add tests that improve stability; skip only when automation cannot meaningfully exercise the change.
