# Monitoring lane

`src/lib/monitoring` is the renderer-side contract for host telemetry backed by Beszel/PocketBase. It is intentionally standalone and must not import Hermes dashboard, gateway, sessions, files, or plugin modules.

## Boundary

Monitoring owns only host telemetry concerns:

- `MONITORING_*` renderer configuration exposed by Vite defines;
- Beszel/PocketBase URL normalization, system selection, and metrics reads through the `host_monitor_request` Tauri command;
- normalization and formatting of host CPU, memory, disk, thermal, uptime, and process placeholders.

Secrets, auth tokens, and CORS-sensitive monitoring access stay behind Tauri commands. Monitoring must not reuse Hermes `dashboard_request`; that bridge is Hermes-only.

## Renderer module map

- `domain/metrics.ts` owns host telemetry DTOs and the empty metrics value.
- `domain/normalize.ts` normalizes Beszel/PocketBase records into the UI metrics contract.
- `domain/format.ts` owns display formatting and process sorting helpers.
- `ports/monitoring-port.ts` defines the request/config port shared by adapters and use cases.
- `adapters/beszel-monitoring-adapter.ts` owns MONITORING\_\* Vite config, Beszel URL/system-id normalization, PocketBase collection paths, and the `host_monitor_request` Tauri adapter.
- `application/get-host-metrics.ts` orchestrates Beszel system/details/stats reads and returns normalized metrics.
