# Monitoring lane

Monitoring owns only telemetry concerns:

- non-secret runtime configuration loaded through the `get_monitoring_config` Tauri command from `~/.bitch/config.yaml`;
- Beszel/PocketBase URL normalization, system selection, and metrics reads through the `monitoring_request` Tauri command;
- normalization and formatting of system CPU, memory, disk, thermal, uptime, and container rows.

It must not import Hermes dashboard/session/files/gateway/composer modules, and Hermes modules must not import monitoring modules. Shared formatting belongs in `domain/`; privileged network/auth belongs behind the Tauri monitoring commands.

## Current modules

- `domain/metrics.ts` defines normalized dashboard telemetry types and empty defaults.
- `domain/normalize.ts` owns Beszel/PocketBase record coercion.
- `domain/format.ts` owns display formatting and container sorting helpers.
- `ports/monitoring-port.ts` defines the request/config port shared by adapters and use cases.
- `adapters/beszel-monitoring-adapter.ts` owns runtime monitoring config loading, Beszel URL/system-id normalization, PocketBase collection paths, and the `monitoring_request` Tauri adapter.
- `application/get-monitoring-metrics.ts` orchestrates Beszel system/details/stats/container reads and returns normalized metrics.
