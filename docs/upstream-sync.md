# Upstream Hermes Sync

BITCH vendors a small amount of Hermes dashboard code so the desktop renderer can
speak the same JSON-RPC transport as the remote dashboard without bootstrapping a
local Hermes process. Keep those copies boring, explicit, and reviewed.

## Cadence

Run the upstream sync check monthly, and immediately after upstream Hermes changes
near `apps/shared/src/json-rpc-gateway.ts`, dashboard gateway wiring, or any
shared TypeScript types that BITCH mirrors locally.

```bash
npm run check:transport-drift
npm run check:upstream-sync
```

`check:transport-drift` is the focused CI-friendly guard for
`src/lib/gateway/json-rpc-gateway.ts`. `check:upstream-sync` checks every group in
`scripts/hermes-upstream-sync.json`; today that means the transport group plus a
successful no-op type group.

## Sync workflow

1. Run the drift guard:

   ```bash
   npm run check:transport-drift
   ```

2. If drift is reported, sync the transport copy:

   ```bash
   npm run sync:transport
   ```

3. Keep the type-sync companion path in the same workflow. It is intentionally a
   no-op until the manifest registers mirrored upstream desktop/shared types:

   ```bash
   npm run sync:types
   ```

4. Inspect the vendored transport diff first:

   ```bash
   git diff -- src/lib/gateway/json-rpc-gateway.ts
   ```

5. Manually adapt local bridge code when upstream behavior or APIs changed. Check
   at least:

   ```bash
   git diff -- src/lib/gateway/hermes.ts src/lib/gateway/tauri-gateway-socket.ts src-tauri/src/lib.rs
   ```

6. Run the focused sync contract test and then the standard validation stack:

   ```bash
   npm test -- src/lib/gateway/upstream-sync-contract.test.ts
   npm run fmt:check
   npm run type-check
   npm run lint
   npm test
   npm run frontend:build
   npm audit --audit-level=moderate
   npx --yes knip --reporter json
   git diff --check
   ```

Do not treat a copied transport update as self-merging chrome. The Tauri bridge
owns auth headers, WebSocket ticketing, and proxy frames; upstream dashboard
changes can require manual local adaptation in `src-tauri/src/lib.rs` even when
TypeScript still compiles.

## Adding mirrored upstream types

When BITCH starts mirroring more Hermes desktop/shared TypeScript types, add each
file to the `types` group in `scripts/hermes-upstream-sync.json` with the upstream
URL, local path, and formatting mode. `npm run sync:types` and
`npm run check:upstream-sync` will start enforcing those entries automatically.
