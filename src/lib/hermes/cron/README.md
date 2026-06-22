# Hermes Cron subfeature

Cron helpers are Hermes dashboard plugin calls served under `/api/cron/*` through the Tauri `dashboard_request` bridge. Renderer code should import `$lib/hermes/cron`; `$lib/api/cron` is a compatibility shim.

Do not route non-Hermes schedulers or local cron state through this module.
