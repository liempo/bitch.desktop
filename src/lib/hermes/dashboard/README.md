# Hermes dashboard subfeature

This subfeature is the public renderer contract for Hermes dashboard REST and plugin routes. It currently re-exports the existing `$lib/api` helpers so the backend revamp can move implementation files later without breaking consumers.

## Ownership

- Sessions, profiles, model metadata, and prompt/runtime dashboard routes.
- Cron and Kanban plugin routes that are served by the Hermes dashboard.
- `dashboard_request` calls validated by the Rust Hermes bridge.

Do not route Beszel, CalDAV, or other external services through this subfeature. `dashboard_request` remains Hermes-only and path-validated to `/api/*`.
