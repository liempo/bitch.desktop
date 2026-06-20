# Kanban + Cron Sequential Implementation Plan

> **For Hermes:** This is a sequential implementation plan. Do not open Kanban and Cron PRs at the same time.

**Goal:** Implement BITCH's first-class Kanban view first, open/verify one PR, then implement the Cron manager only after the Kanban PR is merged into `main`.

**Architecture:** Both features use existing authenticated Hermes dashboard routes through the Tauri `dashboard_request` bridge. Kanban uses `/api/plugins/kanban/*`; Cron will use `/api/cron/*`. The desktop app remains remote-only and does not add local Hermes bootstrap code.

**Tech Stack:** Svelte 5, Tailwind, Tauri `invoke('dashboard_request')`, existing BITCH API helper patterns, source-contract Vitest tests.

---

## Sequence / Gate

1. **Kanban View PR**
   - Branch: `feat/kanban-board-view`
   - Workspace: `/opt/data/bitch-kanban-board-view`
   - Kanban card: `t_0804861d`
   - Deliverable: one PR against `main`.
   - Stop after PR is open/verified. Do not implement Cron yet.

2. **Cron Manager PR**
   - Kanban card: `t_385d968f`
   - Depends on `t_0804861d`.
   - Start only after the Kanban View PR is merged into `main`.

## Board State Rules

- Park non-focus cards unassigned so the dispatcher does not start simultaneous stale branches.
- Keep `t_385d968f` dependent on `t_0804861d`.
- Complete/advance the Kanban card only with PR URL, changed files, and validation output.

## Validation Standard

For each PR:

```bash
npm run fmt:check
npm run type-check
npm run lint
npm test
npm run frontend:build
npm audit --audit-level=moderate
npx --yes knip --reporter json
git diff --check
```

Add focused tests for route wiring and typed API request behavior before running the full stack.
