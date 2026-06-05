# 04 — Message thread

**Goal:** Render a session's transcript and stream live turns.

## Data flow

1. Hydrate from `getSessionMessages(sessionId)` (HTTP) or the messages returned
   by `session.resume` / `session.create`.
2. Subscribe to `gateway.on(...)`, filtering by `event.session_id`:
   - `message.start` → mark busy, begin a new assistant message.
   - `message.delta` `{text}` → append to the streaming assistant message.
   - `reasoning.delta` / `reasoning.available` `{text}` → append to a collapsible
     reasoning block. (`thinking.delta` is ignored — it is spinner status.)
   - `tool.start` / `tool.progress` / `tool.generating` → upsert a running tool
     row; `tool.complete` → mark it complete.
   - `message.complete` `{text, rendered, usage}` → finalize the assistant
     message and clear busy.
   - `status.update`, `session.info` → update model / running / usage metadata.
   - `error` `{message}` → attach an inline error to the assistant message.
3. Normalize stored `SessionMessage` content via `coerceGatewayText` (ported from
   `messages/chat-runtime.ts`).

## Store ([`src/lib/stores/messages.svelte.ts`](../../src/lib/stores/messages.svelte.ts))

Per-session message map plus busy/needsInput flags. Exposes hydrate, the event
handler, and helpers to append/complete/fail the current assistant message.

## UI

```
src/app/thread/
  Thread.svelte     # scroll container, auto-stick-to-bottom, empty intro
  Message.svelte    # user / assistant / system bubble
  ToolRow.svelte    # tool name + status + summary
  Reasoning.svelte  # collapsible thinking/reasoning block
  Markdown.svelte   # marked + DOMPurify rendering of assistant text
```

- Auto-scroll to bottom unless the user scrolled up.
- Markdown rendering uses `marked` + `dompurify` (added as dependencies).
- Empty state intro when there is no active session.

## Upstream files

- [use-message-stream.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-message-stream.ts)
- [chat-runtime.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/lib/chat-runtime.ts)
- [thread.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/thread.tsx)
- [markdown-text.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/markdown-text.tsx)
- [tool-fallback.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/tool-fallback.tsx)

## Acceptance

Selecting a session shows its history; sending a prompt streams the assistant
reply token-by-token with reasoning and tool rows; errors render inline.
