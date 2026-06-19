# Roadmap

bitch.desktop is a Tauri + Svelte 5 desktop client for remote Hermes dashboard
gateway access. This page tracks delivered scope, near-term upstream candidates,
and features that remain deferred because they require larger UI ports or
upstream gateway support.

## Delivered

The implementation now covers remote Hermes chat, session management,
interactive runtime prompts, documentation, multi-profile remote routing,
live-thread resume behavior, MCP reload routing, and macOS desktop
notifications, and authenticated remote-file previews/media.

| #   | Feature                                                                                | Key files                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | Tauri HTTP bridge with `dashboard_request` auth injection                              | `src-tauri/src/lib.rs`, `src/lib/api/dashboard.ts`                                                                                                     |
| 02  | App shell, hash router, connection gate, and live session re-select                    | `AppShell.svelte`, `router.svelte.ts`, `gateway.svelte.ts`, `resume.ts`                                                                                |
| 03  | Session sidebar: list, search, create, switch, rename, archive, delete, pin            | `Sidebar.svelte`, `SessionRow.svelte`, `session.svelte.ts`                                                                                             |
| 04  | Message thread: streaming, reasoning blocks, tool rows, markdown                       | `Thread.svelte`, `Message.svelte`, `ToolRow.svelte`, `Reasoning.svelte`, `messages.svelte.ts`                                                          |
| 05  | Rich composer: send, interrupt, queue, slash commands, model switch, attachments       | `Composer.svelte`, `composer.svelte.ts`, `composer-queue.ts`                                                                                           |
| 06  | Interactive prompts: clarify, approval, sudo, secret                                   | `ClarifyCard.svelte`, `ApprovalBar.svelte`, `SudoModal.svelte`, `SecretModal.svelte`, `prompts.svelte.ts`                                              |
| 07  | Library reorganisation under `api/`, `gateway/`, `messages/`, `session` modules        | `src/lib/**`, `docs/wiki/ARCHITECTURE.md`                                                                                                              |
| 08  | Remote profile support: profile rail, scoped sessions, per-profile routing             | `profile.svelte.ts`, `gateway.svelte.ts`, `session.svelte.ts`, `messages.svelte.ts`, `prompts.svelte.ts`, `ProfileRail.svelte`, `src-tauri/src/lib.rs` |
| 09  | Live thread preservation and busy sync across session re-select                        | `resume.ts`, `messages.svelte.ts`, `composer.svelte.ts`, `live-thread-preservation.md`                                                                 |
| 10  | MCP reload composer routing and macOS operator notifications                           | `composer.svelte.ts`, `composer.reload-mcp.test.ts`, `notifications/macos.ts`, `messages.svelte.ts`, `src-tauri/src/lib.rs`                            |
| 11  | Hermes remote files: Files page tree, `@file:` preview rail, `MEDIA:` inline rendering | `remote-files.ts`, `media.ts`, `preview.ts`, `FilesPage.svelte`, `PreviewSidebar.svelte`, `Markdown.svelte`                                            |

## Remote Profile Model

Remote profile support follows upstream Hermes Desktop's practical remote model:
run one dashboard backend per live profile and map profile names to backend URLs
in connection config. The app can browse all profile histories through
`/api/profiles/sessions`, but live chat WebSocket execution and blocking prompt
responses follow the selected profile's resolved backend URL/port.

Desktop-owned slash commands such as `/profile` and `/reload-mcp` are handled
locally in `composer.svelte.ts` so status reflects the session or new-chat
profile instead of the backend process-global default.

See [`remote-profile-support.md`](remote-profile-support.md) for architecture, config shape, constraints, and validation coverage.

## Live Resume Model

Session re-select refreshes from HTTP history only when the visible thread is
idle and not ahead of the stored snapshot. If a turn is still streaming, the
in-memory thread remains the render source so partial assistant output, pending
tool rows, and queued prompt state survive switching away and back.

After resume, gateway `info.running` is applied to local busy state. If
`prompt.submit` still returns `session busy`, the composer reasserts busy state
and queues the draft instead of losing the prompt or rendering a false assistant
error.

See [`live-thread-preservation.md`](live-thread-preservation.md) for the detailed flow and tests.

## Remote File and Media Model

Remote files now use official Hermes dashboard filesystem routes through the
Tauri bridge. The Files route lists the active profile's remote filesystem,
explicit `@file:` references open the right preview rail for any absolute
Hermes-visible path, and `MEDIA:` hydrates image/audio/video elements from
`/api/fs/read-data-url`. Raw absolute paths remain plain text, and the app no
longer requires a public sidecar or custom local reference plugin.

See [`hermes-remote-files.md`](hermes-remote-files.md) for the resolver contract, denied-path behavior, and
probe checklist.

## Near-Term Candidates

These map to existing dashboard or desktop features and have clear scope.

### Cron Job Manager

Port a dashboard-style cron manager into Svelte/Tauri so the desktop can inspect
and steer Hermes scheduled jobs without opening the web dashboard.

Target scope:

- list cron jobs with status, schedule, prompt summary, delivery target, profile,
  last run, and next run
- create and edit jobs with the same core fields exposed by Hermes dashboard:
  schedule, prompt, skills, model override, toolset restriction, delivery, script,
  no-agent mode, context chaining, workdir, and profile
- pause, resume, remove, and run jobs from row actions
- show recent run output and failure state without turning the chat thread into a
  diagnostics junk drawer
- reuse dashboard/gateway cron endpoints through the Tauri HTTP bridge; do not
  invent a separate scheduler client

### Kanban Board

Add a kanban surface similar to the Hermes dashboard board view. This should be a
first-class app route, not a chat-message rendering trick wearing a trench coat.

Target scope:

- list boards and cards available through the Hermes kanban API/tooling
- show columns, card metadata, assignee/status labels, and stale/in-progress
  markers
- support drag/drop status changes where the backend supports mutation
- open card detail panes for description, linked session/PR/issue, and activity
- preserve remote-profile context so cards created or updated from a profile stay
  associated with the correct backend lane

### Calendar UI over CalDAV

Integrate a calendar route backed by CalDAV, using an existing CalDAV client and
an existing Svelte-compatible calendar UI library rather than building protocol
or calendar-grid machinery by hand.

Target scope:

- connect to the configured CalDAV source used by the homestation calendar stack
- display day, week, month, and agenda views through the selected calendar UI
  library
- start read-only, then add create/edit/delete event flows once sync behavior is
  proven
- support multiple calendars, color mapping, timezone correctness, recurring
  events, and event alarms where the CalDAV client exposes them cleanly
- store credentials/configuration in the same connection settings model as other
  remote desktop integrations, with Tauri bridge support if browser CORS blocks
  direct CalDAV access

### Profile Administration UI

Out of scope for bitch.desktop. Profile administration is configured in Hermes
itself, and this app will only support profile selection / routing, not profile
CRUD or admin screens.

Upstream references:

- [app/profiles/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/profiles)
- [profile-switcher.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/profile-switcher.tsx)

### Audio / Voice

The HTTP bridge already proxies `/api/audio/transcribe` and `/api/audio/speak`.
The missing layer is UI and device handling:

- mic capture through browser `getUserMedia` or a Tauri dialog flow
- playback for TTS responses
- conversation mode toggle for voice-in, transcribe, submit, speak response
- ElevenLabs voice selection

Upstream references:

- [composer/voice-activity.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/voice-activity.tsx)
- [use-voice-conversation.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/hooks/use-voice-conversation.ts)
- [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts) (`transcribeAudio`, `speakText`)

### Right-Rail Preview

A web, file, or tool-output preview pane can sit alongside the thread without
bringing over the Electron-only terminal. The gateway already pushes rendered
content and URLs; a sandboxed iframe or webview pane would handle display.

Upstream references:

- [right-rail/preview-pane.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/right-rail/preview-pane.tsx)
- [use-preview-routing.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-preview-routing.ts)

### Session Branch / Fork

The `/branch` slash command and fork semantics are gateway-supported through
`session.create` with seed messages from the current session. The desktop client
still needs UI plumbing for a branch indicator and parent navigation.

### Upstream Transport Sync Cadence

Schedule `npm run sync:transport` or one-shot automation to keep the copied
`json-rpc-gateway.ts` current. A companion type-sync script would pull upstream
TypeScript types that have drifted.

## Medium-Term Candidates

These are larger features that map to upstream admin routes.

### Admin Routes: Settings, Skills, Messaging

The upstream desktop has full admin panels for:

- agent settings for model, provider, and tool configuration
- skill management for list, edit, create, and delete
- messaging channel list and status

Cron is tracked separately above because it is a high-value dashboard utility
for this app. These remaining admin routes would need Svelte ports plus Tauri
HTTP bridge extensions for any admin API routes the gateway exposes.

References:

- [app/settings/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/settings)
- [app/skills/](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop/src/app/skills)

### Subagent / Delegate Progress UI

Richer nested progress display for delegated subtasks remains open. Upstream
shows nested progress bars and intermediate results; bitch.desktop currently
shows flat tool rows.

## Future / Speculative

These depend on upstream gateway capabilities that are not yet stable in remote
mode, or they require significant new infrastructure.

- **Single-URL live profile switching**: browsing/history works via profile REST
  endpoints, but live remote chat still binds to whichever profile the single
  backend process booted with. Upstream issue
  [#37713](https://github.com/NousResearch/hermes-agent/issues/37713) remains
  the relevant blocker.
- **Persistent workspace / file browser**: upstream Electron has `node-pty`
  terminal and file tree, but both assume local IPC. Gateway-side file APIs need
  to exist first.
- **Offline / local mode**: this repo is deliberately remote-only. Local mode
  would mean bundling or spawning a local Hermes process, which is out of scope
  unless explicitly requested.

## Upstream Reference Index

Repo: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) (`main`).

| Feature             | Upstream source                                                                                                                             | Port status                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| JSON-RPC transport  | [json-rpc-gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/shared/src/json-rpc-gateway.ts)                           | Synced from upstream, repo-formatted via `npm run sync:transport` |
| Gateway subclass    | [hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/hermes.ts)                                              | Hand-ported as `src/lib/gateway/hermes.ts`                        |
| Profile store       | [store/profile.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/profile.ts)                                | Svelte runes port                                                 |
| Gateway registry    | [store/gateway.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/gateway.ts)                                | Svelte/Tauri remote adaptation                                    |
| Profile rail        | [profile-switcher.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/profile-switcher.tsx)       | Svelte port                                                       |
| Chat runtime        | [chat-runtime.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/lib/chat-runtime.ts)                              | Hand-ported                                                       |
| Session types       | [types/hermes.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/types/hermes.ts)                                  | Adapted                                                           |
| App shell           | [app-shell.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/shell/app-shell.tsx)                            | Svelte port                                                       |
| Sidebar             | [sidebar/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/index.tsx)                     | Svelte port                                                       |
| Thread              | [thread.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/thread.tsx)                    | Svelte port                                                       |
| Composer            | [composer/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/index.tsx)                   | Svelte port                                                       |
| Interactive prompts | [clarify-tool.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/clarify-tool.tsx)        | Svelte port                                                       |
| Voice UI            | [composer/voice-activity.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/voice-activity.tsx) | Not started                                                       |
| Right-rail preview  | [right-rail/preview-pane.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/right-rail/preview-pane.tsx) | Not started                                                       |
| Cron manager        | Hermes dashboard cron surface                                                                                                               | Planned dashboard-style Svelte/Tauri port                         |
| Kanban board        | Hermes dashboard kanban surface                                                                                                             | Planned dashboard-style Svelte/Tauri port                         |
| CalDAV calendar UI  | Existing CalDAV client + Svelte-compatible calendar UI library                                                                              | Planned calendar route                                            |
