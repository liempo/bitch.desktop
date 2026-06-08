# Devlog — BITCH Desktop

Chronological record of BITCH Desktop development.

## 2026-06-08 — Remote profile support implemented

Implemented the upstream remote profile workaround for BITCH Desktop:

- `ProfileRail.svelte` exposes a compact profile selector and all-profiles history scope.
- `profile.svelte.ts` tracks active gateway profile, profile scope, fresh-draft requests, and rail cosmetics.
- `gateway.svelte.ts` now keeps a profile-keyed `HermesGateway` registry instead of one singleton socket.
- `src-tauri/src/lib.rs` persists remote connection config and resolves per-profile REST/WebSocket URLs from `connection.json`.
- `session.svelte.ts`, `messages.svelte.ts`, and `resume.ts` pass profile ownership through list, history, create, resume, and mutation flows.

Known constraint remains upstream issue [#37713](https://github.com/NousResearch/hermes-agent/issues/37713): one remote dashboard URL cannot switch the live Hermes execution profile by itself. Live multi-profile chat uses one dashboard backend per profile/port.

---

## 2026-06-07 — Gateway connection, chat & sessions verified; multi-profile research

Manual testing confirmed three core flows working:

- **Gateway connection** — App connects to remote Hermes TUI gateway (`:9119`), authenticates with session token, and maintains a stable WebSocket JSON-RPC connection through the Tauri Rust bridge.
- **Chat thread** — Messages stream in real-time (`message.start` → `message.delta` → `message.complete`). Tool rows, reasoning blocks, markdown rendering, and auto-scroll all functional.
- **Session management** — Sidebar lists sessions with search, session resume via URL hash, create new session, rename, archive, and delete all operational.

**Blocking gap:** No multi-profile support. The app connects to a single gateway URL from `.env` with a single session token. Profile selection (bitch / bitch-a / bitch-t) needs architecture decisions.

**Research findings** (upstream issue [#37713](https://github.com/NousResearch/hermes-agent/issues/37713)):

**Recommended approach:** Store a profile-to-gateway-URL map (e.g. in localStorage) and switch the active WebSocket connection when the user selects a different profile. Each profile gateway runs on its own port (our existing 9119/9120/9121), giving strong process-level isolation. This matches the upstream Desktop's internal architecture (separate backend process per profile) adapted for remote mode.

Rejected alternatives:

- Profile-aware WS routing (`?profile=x`) — the gateway is profile-blind by design ([#30626](https://github.com/NousResearch/hermes-agent/issues/30626))
- `POST /api/profile/reload` — risky due to global state pollution

---

## 2026-06-06 — Threading rework merged

**PR #13** (`feat/threading-rework`) merged — reworked message threading to match upstream Desktop rendering. Fixed how `HermesGateway` emits `message.start/delta/complete` events and how tool rows associate with their parent messages.

Also fixed tool rows to display the gateway context (which gateway/session a tool belongs to) so the UI is semantically correct for multi-session usage.

**Open issues after merge:**

- Tool progress still uses transient-only rendering; no persisted progress history survives page reload (inherited from upstream gateway behaviour).

---

## 2026-06-05 — Interactive prompts, lib refactor, architecture docs

**PR #10** — Plan 06 implemented: interactive prompt handling.

- `ClarifyCard.svelte` — multi-choice / text-input prompts
- `ApprovalBar.svelte` — once/session/always/deny tool approval
- `SudoModal.svelte` — masked password entry
- `SecretModal.svelte` — env-var prompt with masking control

**PR #11** — Module layout reorganisation. Renamed Plan 07 → `ROADMAP.md`.

**PR #12** — Architecture documentation. Moved implemented plans to `docs/wiki/` with `ARCHITECTURE.md` as the canonical design reference.

---

## 2026-06-04 — Launch day

Repository created and five plans shipped in a single session (~7 hours from first commit to Plan 06 ready).

| PR  | Branch                          | Title                                       | Merged (UTC) |
| --- | ------------------------------- | ------------------------------------------- | ------------ |
| #1  | `plan-01-tauri-http-bridge`     | Tauri HTTP `dashboard_request` command      | 15:39        |
| #2  | `plan-02-app-shell-and-routing` | App shell, hash router, and stores          | 16:11        |
| #3  | `plan-03-session-sidebar`       | Session sidebar navigation                  | 16:36        |
| #4  | `fix/dashboard-request-bridge`  | Fix dashboard requests through Tauri bridge | 16:45        |
| #5  | `plan-04-message-thread`        | Message transcript streaming                | 17:05        |
| #6  | `plan-05-rich-composer`         | Rich prompt composer                        | 17:41        |
| #7  | `fix-session-id-mismatch`       | Use live session ID for prompt.submit       | 18:14        |
| #8  | `fix-dual-session-ids`          | Track stored + short session IDs            | 18:37        |
| #9  | `fix/session-message-keying`    | Key visible threads by stored session id    | 23:20        |

### Key architecture discoveries

**Dual session IDs** — The Hermes TUI gateway uses two separate identifiers:

- `stored_session_id` — persistent DB key, used in URL hash for session resume
- `session_id` — short 8-char sid, used in `prompt.submit` / `slash.exec` live RPCs

PRs #7 and #8 fixed the mismatch where the app was using the stored key for live RPCs (returning error 4001 "session not found"). The fix: track both — stored key in URL hash, short sid in `activeSessionId`.

**Transport split confirmed:**

- WebSocket (JSON-RPC 2.0) for live turns: proxied through Tauri with auth header
- HTTP REST for session CRUD, model info, audio: via `dashboard_request` command
- Auth token lives only in Rust side (env var) — never exposed to Vite/renderer
