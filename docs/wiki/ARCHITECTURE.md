# Architecture Wiki — BITCH Desktop

Reference documentation for delivered features. Each doc covers the design,
store layout, UI components, integration points, and upstream source files.

| Topic               | Doc                                                | Key files                                                       |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Tauri HTTP bridge   | [`http-bridge.md`](http-bridge.md)                 | `src-tauri/src/lib.rs`, `src/lib/api/dashboard.ts`              |
| App shell & routing | [`app-shell.md`](app-shell.md)                     | `AppShell.svelte`, `router.svelte.ts`, `gateway.svelte.ts`      |
| Session sidebar     | [`session-sidebar.md`](session-sidebar.md)         | `Sidebar.svelte`, `SessionRow.svelte`, `session.svelte.ts`      |
| Message thread      | [`message-thread.md`](message-thread.md)           | `Thread.svelte`, `Message.svelte`, `messages.svelte.ts`         |
| Rich composer       | [`rich-composer.md`](rich-composer.md)             | `Composer.svelte`, `composer.svelte.ts`, `composer-queue.ts`    |
| Interactive prompts | [`interactive-prompts.md`](interactive-prompts.md) | `ClarifyCard.svelte`, `ApprovalBar.svelte`, `prompts.svelte.ts` |

See [`docs/plans/00-overview.md`](../plans/00-overview.md) for the transport
split, RPC contracts, and upstream reference index.

See [`docs/plans/roadmap.md`](../plans/roadmap.md) for future candidates and
deferred features.
