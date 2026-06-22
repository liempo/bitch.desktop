# Hermes dashboard subfeature

This subfeature is the public renderer contract for the shared Hermes dashboard REST client. The implementation lives under `src/lib/hermes/shared/adapters/dashboard-api-client.ts`; Cron and Kanban plugin helpers expose their own Hermes-lane entrypoints.

## Ownership

- Sessions, profiles, model metadata, and prompt/runtime dashboard routes.
- Compatibility re-exports for Cron and Kanban plugin routes; new code should import `$lib/hermes/cron` and `$lib/hermes/kanban` directly.
- `dashboard_request` calls validated by the Rust Hermes bridge.

Do not route Beszel, CalDAV, or other external services through this subfeature. `dashboard_request` remains Hermes-only and path-validated to `/api/*`.
