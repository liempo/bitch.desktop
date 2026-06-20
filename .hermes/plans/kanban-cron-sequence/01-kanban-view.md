# Kanban View Implementation Plan

> **For Hermes:** Implement this plan in the active workspace only. Do not start the Cron manager in this PR.

**Goal:** Add a first-class BITCH Kanban route that displays Hermes Kanban boards/cards and supports core inspection + status/comment mutations through the authenticated dashboard plugin API.

**Architecture:** Add a typed `src/lib/api/kanban.ts` wrapper around `/api/plugins/kanban/*`, add `src/app/kanban/KanbanPage.svelte`, wire `#/kanban` into the app router/navbar, and update the Main dashboard Kanban card from placeholder to route link.

**Tech Stack:** Svelte 5, Tailwind, existing Panel/Button primitives, Tauri `dashboard_request`, Vitest source-contract and API tests.

---

## Tasks

### Task 1: Add typed Kanban API client

**Files:**

- Create: `src/lib/api/kanban.ts`
- Create: `src/lib/api/kanban.test.ts`

**Steps:**

1. Define board/task/detail response interfaces matching `/opt/hermes/plugins/kanban/dashboard/plugin_api.py`.
2. Implement `listKanbanBoards(profile)`, `getKanbanBoard(context)`, `getKanbanTask(taskId, context)`, `updateKanbanTaskStatus(taskId, status, context)`, and `addKanbanComment(taskId, body, context)`.
3. Preserve board, tenant, and profile query context in every call.
4. Test `dashboard_request` paths and bodies.

### Task 2: Add route and nav

**Files:**

- Modify: `src/app/router.svelte.ts`
- Modify: `src/app/AppShell.svelte`
- Modify: `src/app/navigation/AppNavbar.svelte`
- Create: `src/app/kanban-route.test.ts`

**Steps:**

1. Add `kanban` to `AppPage`.
2. Parse `#/kanban` into `{ page: 'kanban' }`.
3. Export `kanbanRoute()`.
4. Mount `<KanbanPage />` in `AppShell`.
5. Add `KANBAN` nav item without breaking AGENT session route preservation.

### Task 3: Build Kanban page

**Files:**

- Create: `src/app/kanban/KanbanPage.svelte`

**Steps:**

1. Load profiles from `profileState`, boards from `/boards`, and selected board data from `/board`.
2. Render board, profile, tenant controls.
3. Render status columns horizontally with card metadata: title, id, tenant, assignee, priority, age, diagnostics/progress/stale markers.
4. Add drag/drop status mutations only for backend-safe statuses; leave dispatcher-owned running state read-only.
5. Add detail pane with description, linked session, PR/issue references, links, activity, run history, comments, and comment submission.
6. Keep the page scrollable and usable in the existing app shell.

### Task 4: Update Main dashboard affordance

**Files:**

- Modify: `src/app/main/dashboard.ts`
- Modify: `src/app/main/dashboard.test.ts`
- Modify: `src/app/main/MainPage.svelte`
- Modify: `src/app/main/MainPage.test.ts`

**Steps:**

1. Add `kanbanRoute()` to dashboard quick links.
2. Mark Kanban as `ready` with `href: #/kanban`.
3. Keep Cron as `planned` until Cron PR.
4. Update Main placeholder text so Kanban no longer claims the endpoint is unwired.

### Task 5: Validate and PR

**Commands:**

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

Then commit, push `feat/kanban-board-view`, open one PR to `main`, and stop. Cron waits for merge.
