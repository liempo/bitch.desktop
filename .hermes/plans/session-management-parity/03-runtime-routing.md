# 03 — Runtime Routing, Prompt Submission, and Indicators

## Objective

Make all live operations use the live runtime session id while user-visible identity, drafts, saved runtime selections, sidebar indicators, and mutations stay keyed to the logical stored thread id.

## Implementation notes

- Keep composer drafts and per-thread model/reasoning/fast choices keyed by logical thread id.
- On submit, create the backend session lazily and immediately route to the stored id after the runtime id is available.
- Send remembered runtime selections before the prompt when resuming a stored thread.
- Mark the stored/display thread working when a prompt starts, clear it when the turn settles, and keep a watchdog to clear abandoned working flags after silence.
- Keep interactive prompt/attention indicators stored-id based so clarify/approval/sudo/secret requests survive focus changes.
- Ensure slash commands that are control-plane commands still dispatch immediately instead of being queued as prompt text.

## Acceptance tests

- `prompt.submit` uses the runtime id returned by `session.create`, while the route uses the stored id.
- Remembered model/reasoning/fast selections apply by logical thread id across continuation tips.
- Working/needs-input row indicators use display/stored ids and clear on completion or error.
- Busy-session prompt submission queues normal text but slash commands dispatch immediately.
