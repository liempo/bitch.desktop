# 06 — Interactive prompts

**Goal:** Keep agent turns unblocked by surfacing the gateway's mid-turn
interactive prompts and responding over the WebSocket. Without these, the agent
silently stalls until its timeout.

| Event                                               | RPC response                            | UI                                                     |
| --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `clarify.request` `{request_id, question, choices}` | `clarify.respond {request_id, answer}`  | inline card in the thread                              |
| `approval.request` `{command, description}`         | `approval.respond {choice, session_id}` | sticky approval bar (`once`/`session`/`always`/`deny`) |
| `sudo.request` `{request_id}`                       | `sudo.respond {request_id, password}`   | modal (masked input)                                   |
| `secret.request` `{request_id, env_var, prompt}`    | `secret.respond {request_id, value}`    | modal (masked input)                                   |

## Store ([`src/lib/hermes/prompts/view-models/prompts.svelte.ts`](../src/lib/hermes/prompts/view-models/prompts.svelte.ts))

Ported from upstream `store/clarify.ts` + `store/prompts.ts`:

- Clarify requests are keyed per session (a background session can park its
  request and resolve after switching back).
- Approval is a single session-keyed slot (no request id).
- Sudo and secret are single request-id slots.
- `clearAllPrompts()` runs on `message.complete` / `error` so stale overlays
  cannot outlive the turn that raised them.

The message-stream handler (plan 04) sets these from the corresponding events.

## UI

```
src/app/prompts/
  ClarifyCard.svelte   # question + choice buttons + free-text answer
  ApprovalBar.svelte   # command + once/session/always/deny
  SudoModal.svelte     # masked password
  SecretModal.svelte   # env var prompt + masked value
```

## Upstream files

- [clarify-tool.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/clarify-tool.tsx)
- [tool-approval.tsx](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/components/assistant-ui/tool-approval.tsx)
- [store/clarify.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/clarify.ts)
- [store/prompts.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/store/prompts.ts)
- [use-prompt-actions.ts](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/src/app/session/hooks/use-prompt-actions.ts) (sudo/secret respond)

## Acceptance

A clarify question renders inline and answering it unblocks the turn; a
dangerous command shows an approval bar whose choices resolve the turn; sudo and
secret prompts show masked modals that submit the response.
