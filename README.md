# bitch.desktop

Minimal Tauri + Svelte desktop client for the Hermes remote dashboard gateway.

This repo is remote-only: it does not bootstrap or run a local Hermes server. The renderer uses the upstream Hermes JSON-RPC transport through a Tauri WebSocket shim, while the Rust backend owns gateway auth and native WebSocket connection setup.

## Stack

- Tauri v2
- Svelte 5
- TypeScript + Vite
- Tailwind CSS for renderer styling
- Rust gateway bridge for status probing, WebSocket ticket minting, auth headers, and native WebSocket proxying
- Hermes JSON-RPC gateway transport copied from upstream

## Configuration

Create a local `.env` from `.env.example` and set:

```bash
VITE_BITCH_GATEWAY_URL=http://127.0.0.1:9119
BITCH_DASHBOARD_API_KEY=replace-me
```

`VITE_BITCH_GATEWAY_URL` points at the Hermes dashboard HTTP origin. `BITCH_DASHBOARD_API_KEY` is consumed by the Tauri backend so the browser renderer does not need to set Hermes auth headers directly.

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
- `npm run sync:transport` — refresh `src/lib/gateway/json-rpc-gateway.ts` from upstream Hermes.

After syncing the upstream transport, inspect the diff and manually adapt the local Tauri bridge/UI if the transport API changed.
