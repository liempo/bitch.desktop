# 02 — Resume Recovery and Loader Escape Hatches

## Objective

Adopt official Hermes Desktop resume semantics so route selection paints immediately, hydrates history quickly, validates/rebinds cached runtime ids, and auto-recovers from transient resume failures.

## Implementation notes

- Start resume by selecting the stored id synchronously and clearing stale view state when no warm runtime cache exists.
- Resolve the owning profile by cheap session lookup before profile-swapping, falling back to cached profile metadata where the current dashboard lacks the direct endpoint.
- Use the stored transcript REST path as the history source; hydrate from all known lineage segments for compressed threads.
- If a cached runtime id exists, validate it with `session.info` before trusting it. On failure, delete the mapping and perform full `session.resume`.
- If `session.resume` fails and the REST transcript cannot paint any history, mark the stored session as resume-failed and let route logic retry with capped exponential backoff.
- After retries exhaust, surface an explicit resumable error instead of an infinite loader.

## Acceptance tests

- Cached runtime success skips `session.resume` but calls `session.info` and keeps the selected stored id.
- Cached runtime `session.info` failure drops the stale mapping and falls through to `session.resume`.
- Resume RPC failure with no fallback messages sets the failed/exhausted state used by the route loader.
- Manual reselect/retry clears the failed/exhausted latch and gets a fresh resume attempt.
