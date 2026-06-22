# 04 — Message thread

**Goal:** Render a session's transcript and stream live turns with the same
layout after refresh as during live streaming.

## Data flow

1. Hydrate from `getSessionMessages(sessionId)` (HTTP) or the messages returned
   by `session.resume` / `session.create`.
2. Subscribe to `gateway.on(...)`, filtering by `event.session_id`:
   - `message.start` → mark busy, begin a new assistant message with `parts: []`.
   - `message.delta` `{text}` → append or extend the last `text` part.
   - `reasoning.delta` / `reasoning.available` / `thinking.delta` `{text}` →
     append or extend a collapsible reasoning part (respect `REASONING_GAP_MS`;
     finalize the current block when text or a tool boundary arrives).
   - `tool.start` / `tool.progress` / `tool.generating` → upsert a running tool
     part; `tool.complete` (or `tool.progress` with a completed status) marks
     it complete.
   - `message.complete` `{text, rendered, usage}` → finalize the assistant
     message and clear busy.
   - `status.update`, `session.info` → update model / running / usage metadata.
   - `error` `{message}` → attach an inline error to the assistant message.
3. Normalize stored `SessionMessage` content via helpers in
   [`src/lib/hermes/threads/domain/message-normalization.ts`](../../src/lib/hermes/threads/domain/message-normalization.ts).

## Chronological `parts` model

Assistant content uses a single ordered `parts` array as the render source of
truth. Legacy buckets (`reasoning`, `text`, `tools`) stay populated for scroll
signatures, copy, and tests.

```ts
export type ThreadMessagePart =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ThreadTool }
```

| Path           | Behaviour                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live streaming | Gateway events append or extend the matching part type in order                                                                                       |
| Rehydration    | `replaceStoredMessages` builds assistant `parts` from stored reasoning + text, then merges following `role: 'tool'` rows into the preceding assistant |
| Rendering      | `Message.svelte` iterates `parts` when present; falls back to `reasoning → tools → text` when absent                                                  |

Orphaned stored tool messages (no preceding assistant) remain standalone
`role: 'tool'` rows.

## Live streaming → `parts`

| Event                                              | Action                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `message.start`                                    | Create assistant message with `parts: []`                                |
| `reasoning.delta` / `thinking.delta`               | Append or extend last `reasoning` part                                   |
| `message.delta`                                    | Append or extend last `text` part                                        |
| `tool.start` / `tool.progress` / `tool.generating` | Append a new `tool` part when creating a tool; update in place otherwise |
| `tool.complete`                                    | Update the matched tool in both `tools` and `parts`                      |
| `message.complete`                                 | Sync final text into the last `text` part                                |

## Rehydration merge

`replaceStoredMessages` iterates stored messages (not a pure `map`):

- Track `lastAssistant` while walking the transcript.
- Assistant rows get `parts` from reasoning blocks + text.
- Tool rows merge into `lastAssistant.tools` and `lastAssistant.parts`.
- Orphan tools keep their own message with a standalone tool part.

## Live thread preservation on re-select

Route resume does not always call `replaceStoredMessages`. Before snapshot
hydration, `shouldPreserveLiveThread(sessionId, snapshotLength)` checks whether
there is already a hydrated live thread that is busy, has `currentAssistantId`,
has pending messages, or has more messages than the stored snapshot. When true,
the in-memory live thread remains the render source so partial assistant output,
running tools, and busy state survive session switching.

When the thread is idle and not ahead of stored history, the HTTP snapshot
refreshes the thread normally. See
[`live-thread-preservation.md`](live-thread-preservation.md) for the resume and
busy-sync flow.

## Tool upsert and completion matching

`upsertTool` resolves the target row with `findToolInThread`:

- Prefer the current assistant, then scan recent assistant messages (handles
  late `tool.complete` after `message.complete` clears `currentAssistantId`).
- Match by `tool_id`, `tool_call_id`, `toolCallId`, or `id`.
- Fall back to pending same-name tools, context overlap, or the sole running tool
  on a message when completion payloads omit the name.
- Treat `tool.progress` payloads whose `status` is `completed` / `complete` /
  `done` / `success` as complete.

Updates go through `commitMessage`, which replaces the message object and
reassigns `thread.messages` so Svelte 5 re-renders tool status changes. Tool
parts in `Message.svelte` are keyed on `tool.id:tool.status`.

## Store and Hermes thread domain

The message ViewModel lives at [`src/lib/hermes/threads/view-models/messages.svelte.ts`](../../src/lib/hermes/threads/view-models/messages.svelte.ts). Hermes-owned thread domain helpers live under [`src/lib/hermes/threads`](../../src/lib/hermes/threads/index.ts), including message normalization, previews, canvas extraction, and media attachments.

## UI

```
src/app/components/thread/
  Thread.svelte     # scroll container, auto-stick-to-bottom, empty intro
  Message.svelte    # user / assistant / system bubble; renders parts chronologically
  Tool.svelte       # tool name + status + summary
  Reasoning.svelte  # collapsible thinking/reasoning block
  Markdown.svelte   # marked + DOMPurify rendering of assistant text
```

- Auto-scroll to bottom unless the user scrolled up. `scrollSignature` includes
  `parts` lengths and tool status so reordering and completion trigger scroll.
- Markdown rendering uses `marked` + `dompurify`.
- Empty state intro when there is no active session.

## Upstream files

- [use-message-stream.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-message-stream.ts)
- [chat-messages.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/lib/chat-messages.ts) — `upsertToolPart`, `findToolPartIndex`
- [chat-runtime.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/lib/chat-runtime.ts)
- [thread.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/thread.tsx)
- [markdown-text.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/markdown-text.tsx)
- [tool-fallback.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/tool-fallback.tsx)

## Acceptance

Selecting a session shows its history with tools nested in assistant bubbles
(matching live layout). Sending a prompt streams reasoning, tools, and text in
gateway order; tool rows transition from running to complete; errors render
inline.

## Tests

Coverage in [`messages.svelte.test.ts`](../../src/lib/hermes/threads/view-models/messages.svelte.test.ts) and Hermes thread-domain tests:

- Live streaming builds ordered `parts` (`reasoning` → `tool` → `text`).
- Rehydration merges stored tool messages into the preceding assistant.
- Orphaned stored tools stay standalone.
- Tool completion after `message.complete`, via `toolCallId`, via progress
  status, and when the completion payload omits the tool name.
