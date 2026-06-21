# Monitoring lane

`src/lib/monitoring` is the renderer-side contract for host telemetry backed by Beszel/PocketBase. It is intentionally standalone and must not import Hermes dashboard, gateway, sessions, files, or plugin modules.

## Boundary

Monitoring owns only host telemetry concerns:

- `MONITORING_*` renderer configuration exposed by Vite defines;
- optional compatibility with existing `HOST_MONITOR_URL` defaults when provided by the backend;
- Beszel/PocketBase URL normalization, system selection, and metrics reads through the `host_monitor_request` Tauri command;
- normalization and formatting of host CPU, memory, disk, thermal, uptime, and process placeholders.

Secrets, auth tokens, and CORS-sensitive monitoring access stay behind Tauri commands. Monitoring must not reuse Hermes `dashboard_request`; that bridge is Hermes-only.
