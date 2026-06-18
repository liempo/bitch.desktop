# Session Management Parity Plan

## Goal

Rework `bitch.desktop` session management so the Svelte/Tauri remote client follows the official Hermes Desktop session behavior instead of treating session ids, sidebars, and loaders as a small local convenience layer.

Official reference points inspected:

- Hermes docs: Desktop app is the same Hermes core/state/sessions as CLI/gateway; sessions are shared and resume across frontends.
- `NousResearch/hermes-agent/apps/desktop/src/store/session.ts`
- `NousResearch/hermes-agent/apps/desktop/src/app/session/hooks/use-session-actions.ts`
- `NousResearch/hermes-agent/apps/desktop/src/app/session/hooks/use-route-resume.ts`
- `NousResearch/hermes-agent/apps/desktop/src/app/session/hooks/use-session-state-cache.ts`

## Behavioral contract

1. Persistent stored session ids drive routes, sidebar identity, mutations, and `session.resume`.
2. Runtime/live session ids drive live RPCs (`prompt.submit`, `slash.exec`, `session.info`, etc.).
3. Stored-to-runtime mappings are cached only while proven live; stale runtime ids must fall back to full resume.
4. A new chat is a draft until the first send creates a backend session; once created, the route switches to the stored id.
5. Session list refreshes must not make active, pinned, working, or just-finished sessions disappear while the backend aggregator catches up.
6. Sidebar rows must be sorted by recent interaction and collapse compression/renewal lineage into one logical thread.
7. Resume must paint history quickly, bind a live runtime id, and recover from transient gateway failures instead of latching a blank loader.
8. Archive/delete must act on the logical thread/canonical stored id, clear runtime mappings, remove pins, and leave the UI in a new-chat state if the current thread is removed.

## Plan graph

- `01-sidebar-lifecycle.md` — stabilize session list merge/visibility and optimistic new rows.
- `02-resume-recovery.md` — add official-style resume fallback, stale runtime detection, and bounded retry/exhaustion state.
- `03-runtime-routing.md` — align prompt/slash/model runtime routing and session indicators with stored/runtime split.
- `04-validation-rollout.md` — focused tests, full validation stack, PR, and Kanban closure.

## Proof standard

Run focused tests for session/composer/resume behavior, then the repository validation stack:

```bash
npm test -- src/lib/stores/session.svelte.test.ts src/lib/session/resume.test.ts src/lib/stores/composer.svelte.test.ts
npm run fmt:check
npm run type-check
npm run lint
npm test
npm run frontend:build
npm audit --audit-level=moderate
npx --yes knip --reporter json
```

No fabricated chrome. If a command cannot run in this environment, record the exact failure and mitigation in the PR body.
