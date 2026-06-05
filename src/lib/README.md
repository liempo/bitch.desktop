# `src/lib` map

Shared renderer code is grouped by boundary instead of parked at the root:

- `api/` — typed HTTP dashboard helpers that go through the Tauri `dashboard_request` bridge.
- `gateway/` — JSON-RPC transport, Hermes gateway subclass, and Tauri WebSocket shim.
- `messages/` — transcript/message normalization helpers.
- `session/` — session orchestration helpers that coordinate stores, routing, and hydration.
- `stores/` — Svelte 5 rune stores for app state.
- `types/` — shared Hermes dashboard and gateway DTOs.

Keep token-bearing HTTP calls in `api/` and the Tauri/Rust bridge. The Vite renderer should never hold `BITCH_DASHBOARD_API_KEY` directly.
