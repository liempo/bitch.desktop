# Cron Manager Follow-up Plan

> **For Hermes:** Do not execute this plan until the Kanban View PR has merged into `main`.

**Goal:** Add a BITCH Cron Manager route backed by Hermes dashboard `/api/cron/*` endpoints.

**Architecture:** Reuse the same authenticated `dashboard_request` bridge used by sessions, files, Kanban, and profiles. Add a typed Cron API client, a dedicated Cron route/page, and row/detail actions for pause/resume/remove/run plus create/edit forms.

**Tech Stack:** Svelte 5, Tailwind, existing UI primitives, Tauri `dashboard_request`, Hermes dashboard cron endpoints.

---

## Deferred Tasks

1. Sync `origin/main` after Kanban PR merge.
2. Create fresh branch from `origin/main`.
3. Implement typed Cron API helper for:
   - `GET /api/cron/jobs`
   - `GET /api/cron/jobs/{job_id}`
   - `GET /api/cron/jobs/{job_id}/runs`
   - `POST /api/cron/jobs`
   - `PUT /api/cron/jobs/{job_id}`
   - `POST /api/cron/jobs/{job_id}/pause`
   - `POST /api/cron/jobs/{job_id}/resume`
   - `POST /api/cron/jobs/{job_id}/trigger`
   - `DELETE /api/cron/jobs/{job_id}`
   - `GET /api/cron/delivery-targets`
4. Add route/nav/dashboard quick link for Cron.
5. Build list/detail/create/edit UI.
6. Add focused source-contract/API tests.
7. Run full validation stack.
8. Open a separate Cron PR.
