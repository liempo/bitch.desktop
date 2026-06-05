# 03 — Session sidebar and switching

**Goal:** Feature parity for session navigation, backed by the HTTP bridge
(plan 01) and the WebSocket RPCs.

## Store ([`src/lib/stores/session.svelte.ts`](../../src/lib/stores/session.svelte.ts))

- Load `listSessions` on boot and after every mutation. Paginate with
  limit/offset (page size ~40).
- `searchSessions` when the query is non-empty (debounced); otherwise show the
  list.
- **Create:** `session.create { cols: 96 }` RPC → navigate to the new id.
- **Switch / resume:** set active `sessionId`, call `session.resume`, and hand
  the returned messages to the message store (plan 04).
- **Actions:** rename (`PATCH {title}`), archive (`PATCH {archived}`), delete
  (`DELETE`), pin (localStorage keyed by `_lineage_root_id` when present, else
  `id`).
- Track per-session `working` / `needsInput` flags for row indicators (driven by
  message-stream events in plan 04).

## UI

```
src/app/sidebar/
  Sidebar.svelte           # search, New chat button, pinned + recents sections
  SessionRow.svelte        # title, preview, indicators, context menu trigger
  SessionActionsMenu.svelte# rename / pin / archive / delete (Bits UI dropdown)
```

- Search input at top; "New chat" button (also bound to meta/ctrl+N).
- Pinned section above recents.
- Working spinner / "needs input" badge on rows.
- "Load more" button when more pages exist.

## Upstream files

- [sidebar/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/index.tsx)
- [session-row.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/session-row.tsx)
- [session-actions-menu.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/sidebar/session-actions-menu.tsx)
- [store/session.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/session.ts)
- [use-session-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-session-actions.ts)

## Acceptance

The sidebar lists remote sessions, search filters them, clicking a row resumes
it and loads its history, "New chat" creates and navigates to a fresh session,
and rename/archive/delete/pin all work and persist.
