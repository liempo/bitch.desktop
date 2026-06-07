# Live thread preservation and busy sync

**Goal:** Preserve in-progress transcript state when switching away from and back to a running session, while keeping local busy state aligned with the Hermes gateway.

## Problem

The desktop client has two transcript sources:

1. **Stored HTTP snapshots** from `getSessionMessages(sessionId)`.
2. **Live WebSocket events** from the runtime session (`message.start`, `message.delta`, tools, `message.complete`).

Stored snapshots can lag the live stream. If a route re-select blindly hydrates from the snapshot, the client can replace an in-memory streaming thread with older stored history. That also clears `currentAssistantId`, pending assistant state, and `thread.busy`, so the composer may show **Send** even while the gateway still reports the session as running.

The visible symptoms are:

- Partial assistant output disappears after switching away and back.
- A follow-up send hits `prompt.submit` while the server is still running and returns `session busy`.

## Invariants

- Visible thread state is keyed by the persistent stored session id.
- Live RPCs still target the short runtime `session_id` through the stored→runtime cache.
- HTTP snapshots refresh idle history; they do not overwrite live in-memory turns.
- Gateway `info.running` is authoritative for busy state after resume.
- A user prompt must not be discarded when the client/server busy state is out of sync.

## Resume and hydration flow

`resumeAndHydrateStoredSession(sessionId)` coordinates route resume in `src/lib/session/resume.ts`:

1. Begin a resume request and mark the thread loading.
2. Fetch the stored HTTP snapshot.
3. Hydrate the snapshot only when `shouldPreserveLiveThread(sessionId, snapshot.length)` is false.
4. Resume the runtime session through `resumeSession(sessionId, requestId)` so `activeSessionId` and the stored→runtime mapping are restored.
5. Apply `SessionResumeResponse.info.running` with `syncRunningFromResume(...)`.
6. If no stored snapshot exists, use the resume projection messages only when no live thread should be preserved.

The preservation helper in `src/lib/stores/messages.svelte.ts` keeps the existing thread when it is hydrated and any of these are true:

- `thread.busy` is true.
- `thread.currentAssistantId` is set.
- Any message is still `pending`.
- The in-memory message count is ahead of the snapshot length.

When the thread is idle and not ahead of the snapshot, re-select refreshes from the HTTP snapshot as usual.

## Cached runtime resume

If a stored session already has a cached runtime id, `resumeSession(...)` can skip `session.resume` and reuse the runtime session. That fast path still asks the gateway for `session.info` so `info.running` can refresh local busy state. This avoids stale local idle state when switching back to a still-running cached runtime.

## Composer busy handling

The normal queue path lives in `src/lib/stores/composer.svelte.ts`: if the selected thread is already busy, `submitPrompt(...)` enqueues the draft instead of calling `prompt.submit`.

The desync safety net catches `prompt.submit` errors whose message matches `/session busy/i`:

1. Re-set the visible thread busy with `setThreadBusy(displayKey, true)`.
2. Remove the optimistic user message that was appended for the failed submit.
3. Enqueue the attempted payload under the stored session key.
4. Clear composer error state and return success, because the prompt is preserved for later drain.

This keeps a normal server busy rejection from rendering as an assistant error or losing the user draft.

## User-visible behavior

| Scenario                                     | Behavior                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Re-select while a turn is streaming          | Preserve the live user message, partial assistant, pending tool rows, and busy state |
| Re-select an idle session                    | Refresh from the stored HTTP snapshot                                                |
| Gateway reports `running: true` after resume | Composer stays in **Queue** mode instead of **Send**                                 |
| `prompt.submit` returns `session busy`       | Reassert busy, enqueue the prompt, and avoid a spurious assistant error              |

## Tests

Coverage is split across focused store tests:

- `src/lib/session/resume.test.ts`
  - preserves live in-memory threads when snapshots are shorter or stale
  - refreshes idle threads from stored snapshots
  - uses resume projection messages for first visits without stored history
  - syncs local busy from resume `info.running`
- `src/lib/stores/composer.svelte.test.ts`
  - re-sets busy and queues the draft when `prompt.submit` returns `session busy`

## Out of scope

- Full app reload during an active turn. In-memory live state is not durable.
- Automatic `session.interrupt` on desync detection.
- Merging a stored snapshot with a separate live tail; the implementation chooses one source per resume pass.
