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
gateway. The old connectivity log moves behind a collapsible dev panel.

## Behavior

- **Boot:** on mount, connect the gateway (existing
  [`HermesGateway`](../../src/lib/hermes.ts) + Tauri socket). Surface
  `connectionState` (`idle`/`connecting`/`open`/`closed`/`error`) as a rune.
- **`requestGateway`:** thin wrapper around `gateway.request` with a friendly
  error message when not connected (mirrors upstream `use-gateway-request`).
- **Routing:** `'/'` shows the empty new-chat intro; `'/:sessionId'` triggers a
  resume of that session. Use `location.hash` so it works in the Tauri webview
  without a server.
- **Connection gate:** disable the composer while `connectionState !== 'open'`.
- **Layout:** collapsible sidebar (~280px), scrollable main, sticky composer,
  Bits UI primitives + Tailwind.

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
