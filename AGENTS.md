# AGENTS.md — BITCH Desktop

## Purpose

BITCH Desktop is a minimal Tauri + Svelte client for Hermes remote gateway access.
Keep the repo remote-only and do not reintroduce local Hermes bootstrap logic unless the user explicitly asks.

## Current upstream copy

The only file currently copied verbatim from the official Hermes repo is:

- `src/lib/json-rpc-gateway.ts` ← copied from `NousResearch/hermes-agent`:
  `apps/shared/src/json-rpc-gateway.ts`

Everything else in this repo is local glue or Tauri-specific wiring unless the file header says otherwise.

If you later decide to sync more upstream code, add it here explicitly and keep the list current.

## Sync command

Use this command to refresh the copied transport layer from upstream:

```bash
npm run sync:transport
```

That command does a simple file copy only. It does **not** migrate local edits automatically.
After syncing, inspect the diff and manually migrate any API or behavior changes into the local Tauri bridge and UI.

## Sync workflow expectations

1. Copy the upstream transport file.
2. Review the diff.
3. Migrate any local changes by hand.
4. Run `npm run type-check`, `npm run lint`, and `npm run frontend:build` when the change touches the renderer.
5. Commit with the repo’s conventional-commit guard.

## Repo-local Rust setup

If you need dev/build on a machine without global Rust tooling, use the repo-local scripts:

- `npm run setup:rust`
- `npm run dev:local`

Those scripts keep Rust state in `.cargo/` and `.rustup/` inside the repo.

## Guardrails

- Keep `commitlint.config.cjs` in CommonJS format.
- Keep Husky hooks simple.
- Do not assume the browser can set the auth headers the Hermes gateway expects.
- If upstream Hermes changes the transport API, preserve the upstream file first and adapt the local wrapper afterwards.
