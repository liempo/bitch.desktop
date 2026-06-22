# Platform lane

`src/lib/platform` is the renderer boundary for native app capabilities exposed by Tauri. It is not a product backend lane. Keep OS/native helpers here and keep Hermes dashboard or Beszel route knowledge out of this folder.

## Current contract

- `invokeTauriCommand` is the only renderer wrapper around `@tauri-apps/api/core` command invocation.
- `listenTauriEvent` is the only renderer wrapper around Tauri event subscriptions.
- `openExternalUrl` is the typed platform use case for opening external HTTP(S) links.

Renderer components and feature modules should import these typed helpers or a feature-specific adapter instead of importing `@tauri-apps/api/*` directly. Token-sensitive Hermes work and monitoring credentials still stay behind Rust commands.
