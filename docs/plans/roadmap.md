# Roadmap — BITCH Desktop

A Tauri + Svelte 5 desktop client for remote Hermes dashboard gateway access.
This document tracks what's been delivered and what's ahead, with upstream
sources linked for every candidate worth porting.

## Delivered (Plans 01–06)

The first implementation pass delivered Hermes-desktop-parity chat for remote
gateway usage:

| #   | Feature                                                                           | Key files                                                                                                 |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 01  | Tauri HTTP bridge — `dashboard_request` with auth injection                       | `src-tauri/src/lib.rs`, `src/lib/api/dashboard.ts`                                                        |
| 02  | App shell + hash router + connection gate                                         | `AppShell.svelte`, `router.svelte.ts`, `gateway.svelte.ts`                                                |
| 03  | Session sidebar — list, search, create, switch, rename, archive, delete, pin      | `Sidebar.svelte`, `SessionRow.svelte`, `session.svelte.ts`                                                |
| 04  | Message thread — streaming, reasoning blocks, tool rows, markdown                 | `Thread.svelte`, `Message.svelte`, `ToolRow.svelte`, `Reasoning.svelte`, `messages.svelte.ts`             |
| 05  | Rich composer — send, interrupt, queue, slash commands, model switch, attachments | `Composer.svelte`, `composer.svelte.ts`, `composer-queue.ts`                                              |
| 06  | Interactive prompts — clarify, approval, sudo, secret                             | `ClarifyCard.svelte`, `ApprovalBar.svelte`, `SudoModal.svelte`, `SecretModal.svelte`, `prompts.svelte.ts` |

**This PR (Plan 07):** lib reorganisation — flat `src/lib/*.ts` → `api/`,
`gateway/`, `messages/`, `session/` subdirectories; import paths updated;
experimental voice wrappers removed from implementation (the gateway audio
endpoints remain reachable through the existing HTTP bridge).

## Near-term candidates

These map to existing upstream desktop features and have clear scope.

### Audio / voice (low-hanging)

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
Electron-only terminal. The gateway already pushes rendered content and URLs;
a sandboxed iframe or webview pane would handle display.

Upstream references:

- [right-rail/preview-pane.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/right-rail/preview-pane.tsx)
- [use-preview-routing.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-preview-routing.ts)

### Session branch / fork

`/branch` slash command and fork semantics — `session.create` with seed
messages from the current session. Already gateway-supported; needs UI plumbing
(branch indicator, parent navigation).

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

Richer nested progress display for delegated subtasks. The upstream shows
nested progress bars and intermediate results; BITCH currently shows flat
tool rows.

## Future / speculative

Features that depend on upstream gateway capabilities not yet stable in
remote mode, or that require significant new infrastructure.

- **Persistent workspace / file browser** — upstream Electron has `node-pty`
  terminal and file tree; both assume local IPC. Gateway-side file APIs would
  need to exist first.
- **Profile switcher in-app** — switching Hermes profiles currently requires
  reconfiguring the gateway URL + token. A profile manager would need either
  multiple gateway connections or a gateway API for profile enumeration and
  switching.
- **Offline / local mode** — this repo is deliberately remote-only. Local mode
  would mean bundling or spawning a local Hermes process, which is out of scope.

## Upstream reference index

Repo: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (main).

| Feature                  | Upstream source                                                                                                                             | Port status                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| JSON-RPC transport       | [json-rpc-gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/shared/src/json-rpc-gateway.ts)                           | Copied verbatim, syncable via `npm run sync:transport` |
| Gateway subclass         | [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts)                                              | Hand-ported as `src/lib/gateway/hermes.ts`             |
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
