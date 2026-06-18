# bitch.desktop

Minimal Tauri + Svelte desktop client for the Hermes remote dashboard gateway.

This repo is remote-only: it does not bootstrap or run a local Hermes server. The renderer uses the upstream Hermes JSON-RPC transport through a Tauri WebSocket shim, while the Rust backend owns gateway auth and native WebSocket connection setup.

## Stack

- Tauri v2
- Svelte 5
- TypeScript + Vite
- Tailwind CSS for renderer styling
- Rust gateway bridge for status probing, WebSocket ticket minting, auth headers, and native WebSocket proxying
- Hermes JSON-RPC gateway transport synced from upstream and normalized with this repo's formatter

## Configuration

Create a local `.env` from `.env.example` and set:

```bash
VITE_HERMES_DASHBOARD_URL=http://127.0.0.1:9119
VITE_BOX_BASE_URL=https://box.airplane-skilift.ts.net
BITCH_DASHBOARD_API_KEY=replace-me
```

`VITE_HERMES_DASHBOARD_URL` points at the Hermes dashboard HTTP origin. `VITE_BOX_BASE_URL` points renderer `/box/...` media/reference URLs and the BOX browser at the public BOX/Dufs origin. `BITCH_DASHBOARD_API_KEY` is consumed by the Tauri backend so the browser renderer does not need to set Hermes auth headers directly.

## File and media references

bitch.desktop treats file and media rendering as an explicit chat syntax contract. BOX/Dufs is the serving layer behind `/box/...` URLs, not the user-facing syntax name.

| Syntax                        | Behavior                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/box/raw.png`                | Stays plain markdown/text. Raw paths are informational only.                                         |
| `@file:/box/report.pdf`       | Opens a BOX-backed file in the right preview sidebar. Quote paths that contain spaces.               |
| `@local:/opt/data/render.png` | Opens an explicit local/gateway path in the right preview sidebar.                                   |
| `MEDIA:/box/render.png`       | Renders images, audio, and video inline in the thread; other file types degrade to a file chip/link. |
| `@image:/box/legacy.png`      | Legacy inline-image alias. Prefer `MEDIA:` for new output.                                           |

Quoted path examples:

```text
@file:`/box/report 1.pdf`
MEDIA:`/box/video 1.mp4`
```

Migration note: earlier builds could turn standalone `/box/...` paths into preview links. New output should use `@file:/box/...` explicitly. That prevents accidental linkification and keeps markdown predictable.

Agent/tooling convention: use `bitch_file_ref` when the user should open or preview a file, and `bitch_media_ref` when the user should see inline media in the thread. Do not emit a raw `/box/...` path when the file is meant to be interactive.

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
- `npm run sync:transport` — refresh `src/lib/gateway/json-rpc-gateway.ts` from upstream Hermes, then normalize it with the repo formatter.

After syncing the upstream transport, inspect the diff and manually adapt the local Tauri bridge/UI if the transport API changed.
