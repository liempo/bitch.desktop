# 02 — App shell and routing

**Goal:** Replace the single-page debug UI with a chat-first shell: a left
session sidebar, a center thread, and a sticky composer, with hash-based routing
between sessions.

## Files

```
src/
  app/
    AppShell.svelte        # layout: sidebar + main column
    router.svelte.ts       # hash router: '/', '/:sessionId'
  lib/stores/
    gateway.svelte.ts      # singleton HermesGateway + connectionState + requestGateway
    layout.svelte.ts       # sidebar open + pins (localStorage)
```

`src/App.svelte` becomes a thin host that mounts `AppShell` and boots the
gateway.

## Behavior

- **Boot:** on mount, connect the gateway (existing
  [`HermesGateway`](../../src/lib/gateway/hermes.ts) + Tauri socket). Surface
  `connectionState` (`idle`/`connecting`/`open`/`closed`/`error`) as a rune.
- **`requestGateway`:** thin wrapper around `gateway.request` with a friendly
  error message when not connected (mirrors upstream `use-gateway-request`).
- **Routing:** `'/'` shows the empty new-chat intro; `'/:sessionId'` triggers a
  resume of that session. Use `location.hash` so it works in the Tauri webview
  without a server.
- **Re-select during streaming:** `resumeAndHydrateStoredSession` preserves live
  in-memory thread state when the thread is busy, has a pending assistant, or is
  ahead of the stored snapshot. Idle sessions still refresh from HTTP history.
  See [`live-thread-preservation.md`](live-thread-preservation.md).
- **Busy sync:** after resume, gateway `info.running` updates local busy state so
  the composer queues while the server still has an active turn.
- **Connection gate:** disable the composer while `connectionState !== 'open'`.
- **Layout:** collapsible sidebar (~280px), scrollable main, sticky composer,
  Bits UI primitives + Tailwind.
- **Session re-select:** returning to a session runs
  [`resumeAndHydrateStoredSession`](../../src/lib/session/resume.ts). When the
  thread is idle and not ahead of the HTTP snapshot, history refreshes from the
  stored snapshot. When a turn is still in progress (busy, pending assistant,
  or more in-memory messages than the snapshot), the live in-memory thread is
  preserved instead of replacing it.
- **Busy sync:** after `session.resume`, local `thread.busy` is aligned with
  `info.running` from the gateway so the composer shows **Queue** while the
  server still has an active turn. Queued sends drain automatically when the
  turn settles.
- **Session busy recovery:** if `prompt.submit` is rejected with "session busy"
  (client/server desync), the client re-asserts busy state and enqueues the
  draft instead of showing a spurious error.

## Upstream files

- [desktop-controller.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/desktop-controller.tsx)
- [app-shell.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/shell/app-shell.tsx)
- [use-gateway-request.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/gateway/hooks/use-gateway-request.ts)
- [use-route-resume.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-route-resume.ts)
- [store/gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/gateway.ts)
- [store/layout.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/layout.ts)

## Acceptance

App launches into the chat shell, connects, and shows connection status. The
sidebar and thread regions render (empty is fine until later plans). Navigating
the hash updates the active session id.
