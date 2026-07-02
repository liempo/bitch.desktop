# BITCH

Remote-only Tauri + Svelte client for the Hermes dashboard gateway.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the backend lane model and [`docs/README.md`](docs/README.md) for feature-organized documentation.

This repo is remote-only: it does not bootstrap or run a local Hermes server. The renderer uses the upstream Hermes JSON-RPC transport through a Tauri WebSocket shim, while the Rust backend owns gateway auth and native WebSocket connection setup.

## Stack

- Tauri v2
- Svelte 5
- TypeScript + Vite
- Tailwind CSS for renderer styling
- Rust gateway bridge for status probing, WebSocket ticket minting, auth headers, and native WebSocket proxying
- Hermes JSON-RPC gateway transport copied from upstream and normalized with this repo's formatter

## Configuration

Create a local `.env` from `.env.example` and set:

```bash
HERMES_DASHBOARD_URL=http://127.0.0.1:9119
HERMES_DASHBOARD_SESSION_TOKEN=replace-me
MONITORING_URL=https://monitoring.airplane-skilift.ts.net
MONITORING_SYSTEM_ID=replace-with-system-id
MONITORING_EMAIL=beszel-user@example.com
MONITORING_PASSWORD=replace-me
```

`HERMES_DASHBOARD_URL` points at the Hermes dashboard HTTP origin. Remote file preview and inline media use the authenticated Hermes filesystem APIs through the Tauri bridge; the renderer does not fetch a public file-server origin or own dashboard auth headers. `HERMES_DASHBOARD_SESSION_TOKEN` is consumed by the Tauri backend so the browser renderer does not need to set Hermes auth headers directly.

`MONITORING_URL` points at the Beszel hub HTTP origin used by the main dashboard. It should include the scheme and port in one value, for example `https://monitoring.airplane-skilift.ts.net` or `http://homestation:8090`; do not add a separate port setting. If you accidentally paste a Beszel page URL such as `/system/<id>`, the app will use the origin and derive the system ID.

Beszel metrics come from PocketBase collection records, not `/api/health`. The health endpoint only proves the hub is alive; `systems` and `system_stats` records usually require auth. Set either `MONITORING_AUTH_TOKEN` or `MONITORING_EMAIL`/`MONITORING_PASSWORD` in `.env`. These secrets are consumed by the Tauri bridge and are not exposed through Vite. `MONITORING_SYSTEM_ID` is optional but useful when the dashboard should target one known system.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` uses `scripts/rust-wrapper.sh`, which keeps Rust state in the repo-local `.cargo/` and `.rustup/` directories. To preinstall that local Rust toolchain before running the app:

```bash
npm run setup:rust
```

macOS still needs Xcode Command Line Tools.

## Useful scripts

- `npm run dev` — run the Tauri app in development mode.
- `npm run build` — build the Tauri app.
- `npm run frontend:build` — build the Vite renderer only.
- `npm run type-check` — run `svelte-check`.
- `npm run lint` — lint renderer source.
- `npm test` — run the default Vitest unit/source-contract and component sweep.
- `npm run test:unit` — run pure unit and source-contract tests only.
- `npm run test:component` — run Svelte component DOM tests with jsdom.
- `npm run test:ui` — run Playwright route-level UI tests with mocked Tauri/dashboard services.
- `npm run test:all` — run the full test pyramid: unit, component, then route UI.

See [`docs/testing.md`](docs/testing.md) for mock ownership, remote-only fixture rules, and the full validation sequence.
