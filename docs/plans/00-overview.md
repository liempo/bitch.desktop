# 00 — Overview

BITCH Desktop is being upgraded from a gateway connectivity dashboard into a
Hermes-desktop-parity chat client. This document is the index for the phased
plans under `docs/plans/`. The work mirrors the official Hermes desktop app
([`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent)),
but stays **remote-only**: all dashboard auth and HTTP stays in the Tauri Rust
bridge, never in the renderer.

## Transport split

The official desktop app talks to the gateway two ways. BITCH mirrors that split:

- **WebSocket JSON-RPC** — live turns: `prompt.submit`, `session.create`,
  `session.resume`, `session.interrupt`, and interactive `*.respond` calls.
- **HTTP dashboard API** — session list, search, stored messages,
  rename/archive/delete. Electron exposes this as `window.hermesDesktop.api`;
  BITCH exposes a `dashboard_request` Tauri command instead.

```mermaid
flowchart TB
  subgraph renderer [Svelte renderer]
    Shell[AppShell]
    Sidebar[SessionSidebar]
    Thread[MessageThread]
    Composer[Composer]
    Prompts[InteractivePrompts]
    Stores[session + message + gateway stores]
  end
  subgraph tauri [Tauri bridge]
    HttpCmd[dashboard_request]
    WsProxy[connect_ws proxy]
  end
  subgraph remote [Remote Hermes dashboard]
    Rest["/api/sessions/*"]
    WS["/api/ws JSON-RPC"]
  end
  Sidebar --> HttpCmd
  Thread --> HttpCmd
  Stores --> WsProxy
  HttpCmd --> Rest
  WsProxy --> WS
```

## Plan dependency graph

| Plan | File                                                         | Depends on |
| ---- | ------------------------------------------------------------ | ---------- |
| 01   | [`01-tauri-http-bridge.md`](01-tauri-http-bridge.md)         | —          |
| 02   | [`02-app-shell-and-routing.md`](02-app-shell-and-routing.md) | 01         |
| 03   | [`03-session-sidebar.md`](03-session-sidebar.md)             | 01, 02     |
| 04   | [`04-message-thread.md`](04-message-thread.md)               | 01, 02, 03 |
| 05   | [`05-rich-composer.md`](05-rich-composer.md)                 | 02, 03, 04 |
| 06   | [`06-interactive-prompts.md`](06-interactive-prompts.md)     | 04, 05     |
| 07   | [`07-deferred-features.md`](07-deferred-features.md)         | 06         |

Recommended order: **01 → 02 → 03 → 04 → 05 → 06** (07 is documentation only).

## Feature parity matrix

| Include (~1:1 feature)                                                  | Exclude (local-only / out of scope)                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------- |
| Chat shell: sidebar + thread + composer                                 | Spawn/boot local `hermes dashboard`                     |
| Session list, switch, new, rename, archive, delete                      | Onboarding, self-update, gateway restart UX             |
| FTS session search, pinned sessions, working indicators                 | Electron file tree, node-pty terminal, right-rail xterm |
| Load history + live stream (`message.*`, `thinking.*`, `tool.*`)        | Local workspace `cwd` picker tied to agent FS           |
| Rich composer: send, interrupt, queue, slash, attachments, model switch | Voice conversation mode (deferred to plan 07)           |
| Clarify, approval, sudo, secret modals                                  | Settings / skills / cron / messaging admin pages        |
| `commands.catalog` + `slash.exec` where the gateway exposes them        | Desktop-only slash commands that assume local IPC       |

## Conventions

- **UI:** Bits UI + Tailwind per [`AGENTS.md`](../../AGENTS.md). Avoid bespoke CSS
  outside [`src/app.css`](../../src/app.css) tokens.
- **State:** Svelte 5 runes (`$state`, `$derived`) in `.svelte.ts` stores. No
  nanostores; the upstream nanostore atoms are hand-ported to runes.
- **Upstream sync:** keep copying only
  [`json-rpc-gateway.ts`](../../src/lib/json-rpc-gateway.ts) via
  `npm run sync:transport`; hand-port everything else.
- **Auth:** never expose `BITCH_DASHBOARD_API_KEY` to Vite; all REST goes through
  the Tauri `dashboard_request` command.

## RPC and event contracts (quick reference)

WebSocket RPC methods used by these plans:

| Method              | Params                     | Notes                            |
| ------------------- | -------------------------- | -------------------------------- |
| `session.create`    | `{ cols: 96, cwd? }`       | returns `SessionCreateResponse`  |
| `session.resume`    | `{ session_id, cols? }`    | returns `SessionResumeResponse`  |
| `session.close`     | `{ session_id }`           |                                  |
| `session.interrupt` | `{ session_id }`           |                                  |
| `session.usage`     | `{ session_id }`           | returns `UsageStats`             |
| `prompt.submit`     | `{ session_id, text }`     |                                  |
| `commands.catalog`  | `{ session_id }`           | slash command list               |
| `slash.exec`        | `{ session_id, command }`  | also used for `/model` switch    |
| `clarify.respond`   | `{ request_id, answer }`   |                                  |
| `approval.respond`  | `{ choice, session_id }`   | `once`/`session`/`always`/`deny` |
| `sudo.respond`      | `{ request_id, password }` |                                  |
| `secret.respond`    | `{ request_id, value }`    |                                  |

Server-push events (`gateway.on(...)`): `gateway.ready`, `session.info`,
`message.start`, `message.delta`, `message.complete`, `thinking.delta`
(ignored — spinner status), `reasoning.delta`, `reasoning.available`,
`status.update`, `tool.start`, `tool.progress`, `tool.generating`,
`tool.complete`, `clarify.request`, `approval.request`, `sudo.request`,
`secret.request`, `error`.

HTTP dashboard endpoints used:

| Endpoint                                                 | Method | Purpose                                     |
| -------------------------------------------------------- | ------ | ------------------------------------------- |
| `/api/sessions?limit&offset&min_messages&archived&order` | GET    | list                                        |
| `/api/sessions/search?q=`                                | GET    | full-text search                            |
| `/api/sessions/:id/messages`                             | GET    | stored transcript                           |
| `/api/sessions/:id`                                      | PATCH  | rename (`{title}`) / archive (`{archived}`) |
| `/api/sessions/:id`                                      | DELETE | delete                                      |
| `/api/model/info`                                        | GET    | current global model                        |
| `/api/model/options`                                     | GET    | model picker options                        |

## Hermes upstream reference index

Repo: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (`main`).

### Shared / transport

| Role                       | Upstream                                                                                                          | BITCH local                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| JSON-RPC client + events   | [json-rpc-gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/shared/src/json-rpc-gateway.ts) | [`src/lib/json-rpc-gateway.ts`](../../src/lib/json-rpc-gateway.ts) |
| Gateway subclass           | [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts)                    | [`src/lib/hermes.ts`](../../src/lib/hermes.ts)                     |
| Chat message normalization | [chat-runtime.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/lib/chat-runtime.ts)    | `src/lib/chat-runtime.ts`                                          |
| API / session types        | [types/hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/types/hermes.ts)        | `src/lib/types/hermes.ts`                                          |

### Electron bridge (→ Tauri in plan 01)

| Role                 | Upstream                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP dashboard proxy | [electron/preload.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/preload.cjs)                     |
| IPC handler          | [electron/main.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/main.cjs)                           |
| Connection config    | [electron/connection-config.cjs](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/electron/connection-config.cjs) |

### Per-plan upstream files

- **Plan 02:** [desktop-controller.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/desktop-controller.tsx), [app-shell.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/shell/app-shell.tsx), [use-gateway-request.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/gateway/hooks/use-gateway-request.ts), [use-route-resume.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-route-resume.ts), [store/gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/gateway.ts), [store/layout.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/layout.ts)
- **Plan 03:** [sidebar/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/index.tsx), [session-row.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/session-row.tsx), [session-actions-menu.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/session-actions-menu.tsx), [store/session.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/session.ts), [use-session-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-session-actions.ts)
- **Plan 04:** [use-message-stream.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-message-stream.ts), [thread.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/thread.tsx), [markdown-text.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/markdown-text.tsx), [tool-fallback.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/tool-fallback.tsx)
- **Plan 05:** [composer/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/index.tsx), [use-composer-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/hooks/use-composer-actions.ts), [use-prompt-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-prompt-actions.ts), [store/composer.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/composer.ts), [store/composer-queue.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/composer-queue.ts), [use-model-controls.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-model-controls.ts)
- **Plan 06:** [clarify-tool.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/clarify-tool.tsx), [tool-approval.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/tool-approval.tsx), [store/clarify.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/clarify.ts), [store/prompts.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/prompts.ts)

## Validation checklist

Run after each plan that touches the relevant layer:

| Touch    | Commands                                                                              |
| -------- | ------------------------------------------------------------------------------------- |
| Renderer | `npm run type-check`, `npm run lint`, `npm run frontend:build`                        |
| Rust     | `bash scripts/rust-wrapper.sh cargo check --manifest-path src-tauri/Cargo.toml`       |
| Manual   | connect → new chat → send → stream → clarify/approve → switch session → history loads |
