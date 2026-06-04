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

### Using your system Rust toolchain

```bash
npm install
cp .env.example .env
npm run dev
```

### Using a repo-local Rust toolchain

```bash
npm install
cp .env.example .env
npm run setup:rust
npm run dev:local
```

The local setup stores Rust state in `.cargo/` and `.rustup/` inside the repo.
macOS still needs Xcode Command Line Tools.
