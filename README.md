# BITCH Desktop

Minimal Tauri + Svelte desktop client for Hermes remote gateway.
This repository is clean-slate and remote-only.

## Stack

- Tauri v2
- Svelte 5
- TypeScript
- Vite
- Rust backend proxy for gateway status checks
- Hermes JSON-RPC gateway transport layer copied from upstream

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Note: Tauri build/dev needs a Rust toolchain on PATH.
