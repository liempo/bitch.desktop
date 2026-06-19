# Roadmap

BITCH is a remote-only Tauri + Svelte 5 client for Hermes dashboard
gateway access. This file is the canonical roadmap and the source text for
future Kanban scans.

## Kanban scanner contract

- Generate Kanban cards only from unchecked items under
  [Feature checklist](#feature-checklist).
- Use the checklist item title as the card title.
- Use the `Description`, `Scope`, `Dependencies`, and `References` fields as the
  card body.
- Do not create cards from [Delivered](#delivered) or
  [Deferred / out of scope](#deferred--out-of-scope).
- Mark a feature complete only after the implementation, validation, and docs are
  merged.

## Feature checklist

### Near-term

- [ ] **Main Dashboard Shell**
  - Description: Replace the placeholder `MAIN` route with a useful operations
    landing page for connection status, active profile state, recent sessions,
    and links into the app's utility surfaces.
  - Scope:
    - show active dashboard/profile health and current connection target
    - expose quick navigation to CMD, Files, Cron, Kanban, Calendar, and other
      implemented utility routes
    - keep the route remote-only and avoid local Hermes bootstrap controls

- [ ] **Cron Job Manager**
  - Description: Port a dashboard-style scheduled job manager into Svelte/Tauri
    so desktop users can inspect and steer Hermes cron jobs without opening the
    web dashboard.
  - Scope:
    - list jobs with status, schedule, prompt summary, delivery target, profile,
      last run, and next run
    - create and edit schedule, prompt, skills, model override, toolset
      restriction, delivery, script, no-agent mode, context chaining, workdir,
      and profile fields
    - pause, resume, remove, and run jobs from row actions
    - show recent run output and failure state outside the chat thread
    - reuse dashboard/gateway cron endpoints through the Tauri HTTP bridge

- [ ] **Kanban Board**
  - Description: Add a first-class Kanban route that can display and manage
    Hermes boards, using this roadmap as the source for generated project tasks
    when scans are requested.
  - Scope:
    - list boards and cards available through the Hermes Kanban API/tooling
    - show columns, card metadata, assignee/status labels, and stale or
      in-progress markers
    - support drag/drop status changes where the backend supports mutation
    - open card detail panes for description, linked session, PR, issue, and
      activity
    - preserve remote-profile context so cards created or updated from a profile
      stay associated with the correct backend lane

- [ ] **Calendar UI over CalDAV**
  - Description: Add a calendar route backed by CalDAV using an existing CalDAV
    client and a Svelte-compatible calendar UI library instead of hand-rolling
    protocol or calendar-grid machinery.
  - Scope:
    - connect to the configured CalDAV source used by the homestation calendar
      stack
    - display day, week, month, and agenda views
    - start read-only, then add create/edit/delete event flows after sync
      behavior is proven
    - support multiple calendars, color mapping, timezone correctness, recurring
      events, and alarms where the CalDAV client exposes them cleanly
    - store credentials/configuration in the same connection settings model as
      other remote desktop integrations, with Tauri bridge support if browser
      CORS blocks direct CalDAV access

- [ ] **Audio / Voice**
  - Description: Add the missing desktop UI and device handling for the already
    proxied `/api/audio/transcribe` and `/api/audio/speak` endpoints.
  - Scope:
    - capture microphone input through browser `getUserMedia` or a Tauri dialog
      flow
    - transcribe captured audio into composer input
    - play TTS responses from the gateway
    - provide a conversation-mode toggle for voice-in, submit, and spoken
      response playback
    - expose ElevenLabs voice selection where the backend supports it
  - References:
    - upstream `composer/voice-activity.tsx`
    - upstream `use-voice-conversation.ts`
    - upstream `hermes.ts` audio helpers

- [ ] **Web and Tool Output Preview Rail**
  - Description: Extend the existing right preview sidebar beyond delivered
    file/canvas/media previews so URLs, rendered web content, and selected tool
    outputs can be inspected alongside the thread.
  - Scope:
    - reuse the existing preview sidebar instead of creating a second rail
    - render trusted previews through a sandboxed iframe or webview pane
    - keep Electron-only terminal behavior out of scope
    - preserve current `@file:`, `MEDIA:`, and canvas preview behavior
  - References:
    - upstream `right-rail/preview-pane.tsx`
    - upstream `use-preview-routing.ts`

- [ ] **Session Branch / Fork UI**
  - Description: Add visible branch/fork controls for the gateway-supported
    branch semantics so users can see parentage and navigate between related
    sessions.
  - Scope:
    - expose branch creation from the current session
    - show branch indicator and parent session navigation in the thread shell
    - use gateway `session.create` seed-message behavior and the existing
      `/branch` slash-command semantics

### Medium-term

- [ ] **Admin Utilities: Settings, Skills, Messaging**
  - Description: Port selected upstream admin utilities into desktop routes after
    the higher-value Cron surface lands.
  - Scope:
    - model/provider/tool settings panels
    - skill list, edit, create, and delete flows
    - messaging channel list and status views
    - Tauri HTTP bridge extensions for any admin routes that require dashboard
      auth or remote-profile routing
  - References:
    - upstream `app/settings/`
    - upstream `app/skills/`

- [ ] **Subagent / Delegate Progress UI**
  - Description: Replace flat delegated-tool rows with richer nested progress for
    subagents, including intermediate status and result surfacing where the
    gateway provides it.
  - Scope:
    - show nested subtasks under the parent delegate tool row
    - display progress, completion, and failure state per child task
    - keep the display compact enough for long agent threads
    - preserve existing tool-row behavior for non-delegation tools

## Delivered

Delivered items are historical context. They are not Kanban task sources.

- [x] **Tauri HTTP bridge**
  - Description: Bridge dashboard HTTP calls through Tauri so auth headers and
    session tokens stay out of the renderer while `/api/status`, REST calls, and
    WebSocket ticketing remain reachable.

- [x] **App shell and hash routing**
  - Description: Provide the top-level shell, connection gate, primary
    navigation, hash route handling, and live session re-selection behavior.

- [x] **Session sidebar**
  - Description: List, search, create, switch, rename, archive, delete, and pin
    Hermes sessions from the remote dashboard history.

- [x] **Message thread**
  - Description: Render streaming assistant turns with reasoning blocks, tool
    rows, markdown, media attachments, and completion/error state.

- [x] **Rich composer**
  - Description: Submit prompts, interrupt runs, queue drafts while busy, run
    desktop-owned slash commands, switch models, and attach files.

- [x] **Interactive runtime prompts**
  - Description: Surface clarify, approval, sudo, and secret prompts and route
    responses back to the correct live session/profile.

- [x] **Library reorganization**
  - Description: Group dashboard API, gateway, message, session, prompt, and
    profile logic into focused Svelte/TypeScript modules.

- [x] **Remote profile routing**
  - Description: Support profile rail selection, profile-scoped session history,
    per-profile REST routing, and one WebSocket proxy per selected live profile.

- [x] **Live thread preservation**
  - Description: Preserve in-memory streaming output, pending tool rows, queued
    prompt state, and local busy state when users switch away from and back to a
    running session.

- [x] **MCP reload routing and macOS notifications**
  - Description: Route `/reload-mcp` through the selected profile context and
    send operator notifications for completed desktop turns on macOS.

- [x] **Hermes remote files and media**
  - Description: Mount the remote filesystem at `/`, open explicit `@file:`
    references in the preview rail, render `MEDIA:` images/audio/video inline,
    and use authenticated Hermes dashboard filesystem routes instead of a public
    sidecar.

- [x] **Inline media overlay**
  - Description: Open inline `MEDIA:` image, video, and PDF previews through a
    single overlay contract from the thread markdown renderer.

## Deferred / out of scope

These items should not be scanned into Kanban until they are moved into the
feature checklist.

- **Single-URL live profile switching**
  - Description: Browsing/history works through profile REST endpoints, but live
    remote chat still binds to the profile that a dashboard backend booted with.
  - Blocker: upstream Hermes issue
    [#37713](https://github.com/NousResearch/hermes-agent/issues/37713).

- **Persistent workspace terminal/editor surface**
  - Description: Basic remote file browsing is delivered through Hermes
    filesystem APIs. Remaining workspace parity means terminal/editor/session
    workspace semantics, not the file API itself.
  - Blocker: upstream desktop terminal/editor behavior assumes local Electron
    IPC and `node-pty`.

- **Profile administration UI**
  - Description: Profile creation, rename, deletion, and SOUL/editor screens are
    configured in Hermes itself. This app supports profile selection and routing,
    not profile CRUD.

- **Offline / local mode**
  - Description: The app is deliberately remote-only. Bundling or spawning a
    local Hermes process remains out of scope unless the product direction
    changes explicitly.

## Reference docs

- [Architecture index](ARCHITECTURE.md)
- [Remote profile support](remote-profile-support.md)
- [Live thread preservation](live-thread-preservation.md)
- [Hermes remote files](hermes-remote-files.md)
