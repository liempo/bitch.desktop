# Architecture Docs — bitch.desktop

Reference documentation for delivered features and future candidates. Each doc
covers the design, store layout, UI components, integration points, and upstream
source files.

| Topic               | Doc                                                          | Key files                                                       |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Tauri HTTP bridge   | [`http-bridge.md`](http-bridge.md)                           | `src-tauri/src/lib.rs`, `src/lib/api/dashboard.ts`              |
| App shell & routing | [`app-shell.md`](app-shell.md)                               | `AppShell.svelte`, `router.svelte.ts`, `gateway.svelte.ts`      |
| Session sidebar     | [`session-sidebar.md`](session-sidebar.md)                   | `Sidebar.svelte`, `SessionRow.svelte`, `session.svelte.ts`      |
| Message thread      | [`message-thread.md`](message-thread.md)                     | `Thread.svelte`, `Message.svelte`, `messages.svelte.ts`         |
| Rich composer       | [`rich-composer.md`](rich-composer.md)                       | `Composer.svelte`, `composer.svelte.ts`, `composer-queue.ts`    |
| Live thread resume  | [`live-thread-preservation.md`](live-thread-preservation.md) | `resume.ts`, `messages.svelte.ts`, `composer.svelte.ts`         |
| Interactive prompts | [`interactive-prompts.md`](interactive-prompts.md)           | `ClarifyCard.svelte`, `ApprovalBar.svelte`, `prompts.svelte.ts` |
| Remote profiles     | [`remote-profile-support.md`](remote-profile-support.md)     | `profile.svelte.ts`, `gateway.svelte.ts`, `ProfileRail.svelte`  |
| Remote files spec   | [`hermes-remote-files.md`](hermes-remote-files.md)           | Official Hermes remote file/media migration contract            |
| Roadmap             | [`roadmap.md`](roadmap.md)                                   | Delivered scope, future candidates, upstream references         |
| **Devlog**          | [`devlog.md`](devlog.md)                                     | Chronological development record                                |

bitch.desktop is a remote-only Tauri + Svelte client: **WebSocket JSON-RPC**
drives live turns (`prompt.submit`, `session.*`, interactive `*.respond`);
**HTTP dashboard API** (via the Tauri `dashboard_request` command) handles
session list, search, stored messages, and rename/archive/delete. Dashboard auth
never enters the renderer.

The transport split is summarized here and detailed in
[`http-bridge.md`](http-bridge.md). See [`roadmap.md`](roadmap.md) for future
candidates, deferred features, and the upstream reference index.

## Verified working (as of 2026-06-08)

- **Gateway connection** — connects to remote Hermes TUI gateway, authenticates
  with session token, stable WebSocket JSON-RPC via Tauri bridge
- **Chat thread** — real-time streaming (`message.start` → `message.delta` →
  `message.complete`), tool rows, reasoning blocks, markdown, auto-scroll
- **Session management** — sidebar list + search, URL hash resume, create,
  rename, archive, delete
- **Remote profile support** — profile rail, profile-scoped session history,
  per-profile REST routing, and one WebSocket proxy per selected profile
- **Live thread resume** — switching away and back during a running turn preserves
  the in-memory transcript and keeps local busy state aligned with gateway
  `info.running`

## Known gaps

- **Single-URL remote profile switching** — live chat still executes inside the
  Hermes profile that a given dashboard backend booted with. Multi-profile live
  chat requires per-profile connection overrides pointing at separate dashboard
  backends/ports until upstream resolves remote active-profile switching.
- **Profile administration UI** — create/rename/delete/SOUL editor screens are
  deferred; the profile rail and scoped runtime routing are the delivered core.
- **OAuth per-profile overrides** — token auth is the supported remote override
  path in this pass.
