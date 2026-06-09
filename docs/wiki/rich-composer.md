# 05 — Rich composer

**Goal:** Match the upstream composer capabilities that work against a remote
gateway: send, interrupt, queue, slash commands, model switch, and image/PDF
attachments.

## Stores

- [`src/lib/stores/composer.svelte.ts`](../../src/lib/stores/composer.svelte.ts)
  — per-session draft text and attachment list.
- [`src/lib/stores/composer-queue.ts`](../../src/lib/stores/composer-queue.ts) —
  per-session queued prompts persisted to localStorage (ported from upstream,
  including `shouldAutoDrainOnSettle`).

## Features

- **Input:** auto-growing textarea; draft persisted per session.
- **Send:** `prompt.submit { session_id, text }`. If there is no active session,
  `session.create` first, then submit.
- **Interrupt:** `session.interrupt { session_id }` while the turn is busy.
- **Queue:** when the gateway is busy, Enter enqueues; auto-drain the next entry
  when the turn settles (unless the user explicitly interrupted). If
  `prompt.submit` still returns `session busy` because local state fell behind the
  gateway, the composer reasserts busy, removes the optimistic user row, and
  enqueues the attempted payload instead of surfacing a false assistant error.
  See [`live-thread-preservation.md`](live-thread-preservation.md).
- **Slash:** load `commands.catalog { session_id }` on session open; a `/`
  prefix opens a completion popover and dispatches via `slash.exec`.
- **Model switch:** read `getModelOptions()` / `getGlobalModelInfo()`; switching
  runs `slash.exec { command: "/model <model> --provider <provider>" }` for an
  active session. Show the current model in the composer chrome.
- **Attachments:** hidden webview file input → base64 → remote gateway relay on
  submit. Images call `image.attach_bytes`; PDFs call `pdf.attach`; the final
  `prompt.submit` sends plain text so the gateway's native attachment pipeline
  owns multimodal context. Surface size/encoding errors clearly. Drag-drop is a
  later sub-phase.
- **Remote media display:** assistant markdown image paths from the gateway are
  fetched through authenticated `GET /api/media` via the Tauri dashboard bridge
  so agent-written images render on the client machine.

## Upstream files

- [composer/index.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/composer/index.tsx)
- [use-composer-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/chat/hooks/use-composer-actions.ts)
- [use-prompt-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-prompt-actions.ts)
- [store/composer.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/composer.ts)
- [store/composer-queue.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/composer-queue.ts)
- [use-model-controls.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-model-controls.ts)

## New dependencies

- `@tauri-apps/plugin-dialog` (file picker) — optional; the first pass may use a
  hidden `<input type=file>` in the webview instead.

## Acceptance

Typing and pressing Enter sends a prompt; Stop interrupts; queued prompts drain
after a turn; slash commands list and execute; the model switcher changes the
active model; image/PDF attachments are relayed to the remote gateway before
`prompt.submit`; gateway-local assistant images render through `/api/media`.
