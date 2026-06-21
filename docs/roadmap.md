# Roadmap

BITCH is a remote-only Tauri + Svelte 5 client for Hermes dashboard
gateway access. This file is the canonical roadmap and the source text for
future Kanban scans.

The current product posture is **component refinement before new features**.
The shipped shell, agent, asset, Kanban, Cron, media, and remote-file surfaces
need consolidation and polish before paused feature work is reintroduced.

## Kanban scanner contract

- Generate Kanban cards only from unchecked items under
  [Feature checklist](#feature-checklist).
- The current checklist is intentionally refinement-focused; it should not
  produce new feature-route implementation cards.
- Use the checklist item title as the card title.
- Use the `Description`, `Scope`, `Dependencies`, and `References` fields as the
  card body.
- Do not create cards from [Paused new-feature backlog](#paused-new-feature-backlog),
  [Delivered](#delivered), or [Deferred / out of scope](#deferred--out-of-scope).
- Mark a refinement complete only after implementation, validation, and docs are
  merged.

## Feature checklist

### Current focus: existing component refinement

- [ ] **Main dashboard refinement**
  - Description: Refine the delivered operations dashboard instead of adding new
    dashboard surfaces. The current MAIN route already has host telemetry,
    recent-session context, utility navigation, and a desktop AGENT panel.
  - Scope:
    - harden host-monitor degraded states, refresh cadence, sensor/process
      display, and empty/error copy
    - keep the desktop dashboard dense and one-screen where practical while
      preserving the mobile single-column layout
    - keep quick links to AGENT, ASSETS, CALENDAR, CRON, and KANBAN honest about
      what is implemented versus reserved
    - preserve the remote-only contract: no local Hermes bootstrap controls and
      no public file-server fallbacks

- [ ] **Agent thread, composer, and prompt refinement**
  - Description: Tighten the existing AGENT workflow before adding branch/fork,
    voice, or delegated-progress feature surfaces.
  - Scope:
    - refine streaming message, reasoning, tool-row, attachment, and completion
      states in the shared thread components
    - harden composer behavior for busy sessions, queued prompts, model picker,
      slash commands, attachments, and `/reload-mcp`
    - keep clarify, approval, sudo, and secret prompts profile/session scoped
    - preserve responsive reuse between the AGENT page and embedded dashboard
      chat panel

- [ ] **Assets, preview, and media refinement**
  - Description: Refine the delivered remote filesystem, preview rail, inline
    media, and canvas behavior before expanding into web/tool-output previews.
  - Scope:
    - keep ASSETS mounted at the authenticated remote filesystem root `/`
    - preserve explicit `@file:` preview and `MEDIA:` inline rendering through
      Hermes dashboard filesystem APIs
    - keep image/video/PDF overlays and audio controls consistent across thread
      and preview surfaces
    - make unknown-file text fallback, binary-looking paths, loading states, and
      copy/download affordances clear

- [ ] **Kanban board refinement**
  - Description: Refine the delivered KANBAN route and vertical grouped-list
    workflow instead of generating more feature cards.
  - Scope:
    - harden board/card loading, active profile context, stale/running labels,
      and empty/error states
    - keep review/blocked/done display semantics aligned with the homelab board
      workflow
    - refine card detail panes, comments, PR links, issue links, and activity
      display
    - verify status mutations and drag/drop affordances only where the backend
      supports them cleanly

- [ ] **Cron manager refinement**
  - Description: Refine the delivered CRON route and dashboard scheduler API
    client before adding more administrative utilities.
  - Scope:
    - harden job listing, status, last/next run, failure state, and recent output
      presentation
    - refine create/edit flows for schedule, prompt, skills, model, toolsets,
      delivery, script, no-agent mode, context chaining, and workdir fields
    - verify pause, resume, remove, and run actions through authenticated
      dashboard cron endpoints
    - keep scheduler behavior remote-only; do not add local scheduler shims

- [ ] **Navigation, routing, responsive, and accessibility polish**
  - Description: Consolidate the shipped shell behavior across desktop and mobile
    before re-opening new feature branches.
  - Scope:
    - keep canonical navigation labels as BITCH, AGENT, ASSETS, CALENDAR, CRON,
      and KANBAN
    - preserve legacy route aliases only as compatibility paths, not visible
      product branding
    - verify keyboard/focus behavior for dialogs, sidebars, resize handles, and
      primary route navigation
    - keep route lifecycle safe so gateway streams and background completions are
      not lost while another tab is mounted

## Paused new-feature backlog

These items are intentionally parked outside the Kanban scan surface while the
current focus is refinement. Move an item back under
[Feature checklist](#feature-checklist) only when new feature work is allowed
again.

- **Calendar UI over CalDAV**
  - Description: Add a calendar route backed by CalDAV using an existing CalDAV
    client and a Svelte-compatible calendar UI library instead of hand-rolling
    protocol or calendar-grid machinery.
  - Status: paused after the open feature PR was discarded.

- **Audio / Voice**
  - Description: Add the missing desktop UI and device handling for the already
    proxied `/api/audio/transcribe` and `/api/audio/speak` endpoints.
  - References:
    - upstream `composer/voice-activity.tsx`
    - upstream `use-voice-conversation.ts`
    - upstream `hermes.ts` audio helpers
  - Status: paused after the open feature PR was discarded.

- **Web and Tool Output Preview Rail**
  - Description: Extend the existing right preview sidebar beyond delivered
    file/canvas/media previews so URLs, rendered web content, and selected tool
    outputs can be inspected alongside the thread.
  - References:
    - upstream `right-rail/preview-pane.tsx`
    - upstream `use-preview-routing.ts`
  - Status: paused; refine the existing preview/media surfaces first.

- **Session Branch / Fork UI**
  - Description: Add visible branch/fork controls for the gateway-supported
    branch semantics so users can see parentage and navigate between related
    sessions.
  - Status: paused after the open feature PR was discarded.

- **Admin Utilities: Settings, Skills, Messaging**
  - Description: Port selected upstream admin utilities into desktop routes after
    the higher-value Cron surface lands and the delivered admin-adjacent surfaces
    are refined.
  - References:
    - upstream `app/settings/`
    - upstream `app/skills/`
  - Status: paused after the open feature PR was discarded.

- **Subagent / Delegate Progress UI**
  - Description: Replace flat delegated-tool rows with richer nested progress for
    subagents, including intermediate status and result surfacing where the
    gateway provides it.
  - Status: paused after the open feature PR was discarded.

## Delivered

Delivered items are historical context. They are not Kanban task sources.

- [x] **Main Dashboard Shell**
  - Description: Replaced the placeholder MAIN route with an operations landing
    page, host-monitor telemetry, recent-session context, utility navigation,
    and a desktop AGENT panel while keeping the app remote-only.

- [x] **Cron Job Manager**
  - Description: Added a CRON route and scheduler API client for inspecting and
    steering Hermes cron jobs through authenticated dashboard endpoints.

- [x] **Kanban Board**
  - Description: Added a KANBAN route for Hermes board/card inspection and
    refined it into a vertical grouped-list workflow aligned with review/blocked
    board semantics.

- [x] **Mobile responsive shell**
  - Description: Added mobile responsive behavior for the MAIN and AGENT views,
    including the mobile AGENT link panel and desktop-only embedded dashboard
    chat panel behavior.

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
- [App shell](app-shell.md)
- [HTTP bridge](http-bridge.md)
- [Remote profile support](remote-profile-support.md)
- [Session sidebar](session-sidebar.md)
- [Message thread](message-thread.md)
- [Rich composer](rich-composer.md)
- [Interactive prompts](interactive-prompts.md)
- [Live thread preservation](live-thread-preservation.md)
- [Hermes remote files](hermes-remote-files.md)
