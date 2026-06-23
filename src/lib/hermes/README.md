# Hermes lane

`src/lib/hermes` is the renderer-side Hermes dashboard/runtime lane. It owns Hermes dashboard calls, runtime gateway traffic, remote files, sessions, conversations, composer orchestration, prompts, profiles, Cron, and Kanban helpers behind explicit feature entrypoints.

## Boundary

The Hermes lane owns only Hermes dashboard and runtime concerns:

- dashboard `/api/*` requests through the Tauri `dashboard_request` command;
- authenticated remote filesystem and media preview helpers;
- JSON-RPC gateway client wiring and the Tauri WebSocket shim;
- profile-scoped Hermes dashboard/plugin helpers such as composer submission, sessions, cron, Kanban, BITCH glyph artifacts, prompts, profiles, and runtime calls.

The lane must not absorb Beszel/monitoring telemetry or generic native helpers. Monitoring belongs in `src/lib/monitoring`; native capabilities belong in `src/lib/platform`. Future non-Hermes services get their own lane.

## Public entrypoints

- `src/lib/hermes/dashboard` exposes the shared dashboard REST client.
- `src/lib/hermes/cron` owns Hermes dashboard Cron plugin helpers.
- `src/lib/hermes/composer` owns slash commands, composer queueing, attachment relay, runtime selection, and prompt submission orchestration.
- `src/lib/hermes/files` owns authenticated remote-file helpers.
- `src/lib/hermes/gateway` owns JSON-RPC gateway transport, the Tauri WebSocket shim, gateway runtime ports, and gateway registry ViewModel.
- `src/lib/hermes/glyph` owns the BITCH-side glyph generation prompt, validated scene artifacts, local glyph state, and dashboard plugin sync helper.
- `src/lib/hermes/kanban` owns Hermes dashboard Kanban plugin helpers.
- `src/lib/hermes/profiles` owns profile selection and profile-scoped gateway/API routing helpers.
- `src/lib/hermes/prompts` owns clarify/approval/sudo/secret prompt request state and response orchestration.
- `src/lib/hermes/sessions` owns session lifecycle, resume, sidebar, and session ViewModel exports.
- `src/lib/hermes/conversations` owns the message ViewModel plus canvas, preview, media attachment, and message normalization helpers.

Legacy top-level compatibility imports such as `$lib/api`, `$lib/files`, `$lib/gateway`, `$lib/session`, `$lib/conversation`, `$lib/messages`, `$lib/composer`, and `$lib/stores/*` were removed after call sites migrated. Do not add new re-export shims for those paths.
