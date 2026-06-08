# Roadmap — BITCH Desktop

A Tauri + Svelte 5 desktop client for remote Hermes dashboard gateway access.
This document tracks delivered plans and future upstream candidates.

## Delivered (Plans 01–08)

The implementation now covers remote Hermes chat, session management, interactive
runtime prompts, documentation, and multi-profile remote routing.

| #   | Feature                                                                           | Key files                                                                                                                                              |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | Tauri HTTP bridge — `dashboard_request` with auth injection                       | `src-tauri/src/lib.rs`, `src/lib/api/dashboard.ts`                                                                                                     |
| 02  | App shell + hash router + connection gate                                         | `AppShell.svelte`, `router.svelte.ts`, `gateway.svelte.ts`                                                                                             |
| 03  | Session sidebar — list, search, create, switch, rename, archive, delete, pin      | `Sidebar.svelte`, `SessionRow.svelte`, `session.svelte.ts`                                                                                             |
| 04  | Message thread — streaming, reasoning blocks, tool rows, markdown                 | `Thread.svelte`, `Message.svelte`, `ToolRow.svelte`, `Reasoning.svelte`, `messages.svelte.ts`                                                          |
| 05  | Rich composer — send, interrupt, queue, slash commands, model switch, attachments | `Composer.svelte`, `composer.svelte.ts`, `composer-queue.ts`                                                                                           |
| 06  | Interactive prompts — clarify, approval, sudo, secret                             | `ClarifyCard.svelte`, `ApprovalBar.svelte`, `SudoModal.svelte`, `SecretModal.svelte`, `prompts.svelte.ts`                                              |
| 07  | Lib reorganisation — `api/`, `gateway/`, `messages/`, `session/` modules          | `src/lib/**`, `docs/wiki/ARCHITECTURE.md`                                                                                                              |
| 08  | Remote profile support — profile rail, scoped sessions, per-profile routing       | `profile.svelte.ts`, `gateway.svelte.ts`, `session.svelte.ts`, `messages.svelte.ts`, `prompts.svelte.ts`, `ProfileRail.svelte`, `src-tauri/src/lib.rs` |

### Plan 08 notes

Remote profile support follows upstream Hermes Desktop's practical remote model:
**run one dashboard backend per live profile** and map profile names to backend
URLs in connection config. The app can browse all profile histories through
`/api/profiles/sessions`, but live chat WebSocket execution and blocking prompt
responses follow the selected profile's resolved backend URL/port.

See [`docs/wiki/remote-profile-support.md`](../wiki/remote-profile-support.md)
for architecture, config shape, constraints, and validation coverage.

## Near-term candidates

These map to existing upstream desktop features and have clear scope.

### Profile administration UI

The rail and routing are in place. Remaining profile admin screens can be ported
later:

- create / rename / delete profile dialogs
- SOUL editor
- setup command display
- connection settings editor for per-profile remote overrides

Upstream references:

- [app/profiles/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/profiles)
- [profile-switcher.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/profile-switcher.tsx)

### Audio / voice

The HTTP bridge already proxies `/api/audio/transcribe` and `/api/audio/speak`.
What's missing is the UI layer:

- Mic capture (browser `getUserMedia` or Tauri dialog)
- Audio playback of TTS responses
- Conversation mode toggle (voice-in → transcribe → submit → speak response)
- ElevenLabs voice selection

Upstream references:

- [composer/voice-activity.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/voice-activity.tsx)
- [use-voice-conversation.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/hooks/use-voice-conversation.ts)
- [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts) (`transcribeAudio`, `speakText`)

### Right-rail preview

A web / file / tool-output preview pane alongside the thread, without the
Electron-only terminal. The gateway already pushes rendered content and URLs; a
sandboxed iframe or webview pane would handle display.

Upstream references:

- [right-rail/preview-pane.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/right-rail/preview-pane.tsx)
- [use-preview-routing.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-preview-routing.ts)

### Session branch / fork

`/branch` slash command and fork semantics — `session.create` with seed messages
from the current session. Already gateway-supported; needs UI plumbing (branch
indicator, parent navigation).

### Upstream transport sync cadence

Schedule `npm run sync:transport` (or one-shot automation) to keep the copied
`json-rpc-gateway.ts` current. A companion type-sync script would pull upstream
TypeScript types that have drifted.

## Medium-term candidates

These are larger features that map to upstream admin routes.

### Admin routes: settings, skills, cron, messaging

The upstream desktop has full admin panels for:

- Agent settings (model, provider, tool configuration)
- Skill management (list, edit, create, delete)
- Cron job list and scheduling
- Messaging channel list and status

These are React components at
[app/settings/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/settings),
[app/skills/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/skills),
[app/cron/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/cron)
that would need Svelte ports + Tauri HTTP bridge extensions for any admin API
routes the gateway exposes.

### Subagent / delegate progress UI

Richer nested progress display for delegated subtasks. The upstream shows nested
progress bars and intermediate results; BITCH currently shows flat tool rows.

## Future / speculative

Features that depend on upstream gateway capabilities not yet stable in remote
mode, or that require significant new infrastructure.

- **Single-URL live profile switching** — browsing/history works via profile REST
  endpoints, but live remote chat still binds to whichever profile the single
  backend process booted with. Upstream issue
  [#37713](https://github.com/NousResearch/hermes-agent/issues/37713) remains the
  relevant blocker.
- **Persistent workspace / file browser** — upstream Electron has `node-pty`
  terminal and file tree; both assume local IPC. Gateway-side file APIs would
  need to exist first.
- **Offline / local mode** — this repo is deliberately remote-only. Local mode
  would mean bundling or spawning a local Hermes process, which is out of scope.

## Upstream reference index

Repo: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
(main).

| Feature                  | Upstream source                                                                                                                             | Port status                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| JSON-RPC transport       | [json-rpc-gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/shared/src/json-rpc-gateway.ts)                           | Copied verbatim, syncable via `npm run sync:transport` |
| Gateway subclass         | [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts)                                              | Hand-ported as `src/lib/gateway/hermes.ts`             |
| Profile store            | [store/profile.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/profile.ts)                                | Svelte runes port                                      |
| Gateway registry         | [store/gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/gateway.ts)                                | Svelte/Tauri remote adaptation                         |
| Profile rail             | [profile-switcher.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/profile-switcher.tsx)       | Svelte port                                            |
| Chat runtime             | [chat-runtime.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/lib/chat-runtime.ts)                              | Hand-ported                                            |
| Session types            | [types/hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/types/hermes.ts)                                  | Adapted                                                |
| App shell                | [app-shell.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/shell/app-shell.tsx)                            | Svelte port                                            |
| Sidebar                  | [sidebar/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/index.tsx)                     | Svelte port                                            |
| Thread                   | [thread.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/thread.tsx)                    | Svelte port                                            |
| Composer                 | [composer/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/index.tsx)                   | Svelte port                                            |
| Interactive prompts      | [clarify-tool.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/clarify-tool.tsx)        | Svelte port                                            |
| Voice UI                 | [composer/voice-activity.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/voice-activity.tsx) | Not started                                            |
| Right-rail preview       | [right-rail/preview-pane.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/right-rail/preview-pane.tsx) | Not started                                            |
| Settings / skills / cron | [app/settings/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/settings)                                       | Not started                                            |
