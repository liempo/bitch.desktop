# Hermes Kanban subfeature

Kanban helpers are Hermes dashboard plugin calls served under `/api/plugins/kanban/*` through the Tauri `dashboard_request` bridge. Renderer code should import `$lib/hermes/kanban`.

Do not route Jira, CalDAV, Beszel, or other non-Hermes services through this module.
