# Calendar lane

The Calendar lane is the renderer boundary for non-Hermes CalDAV calendar data.
It follows the same Clean MVVM / Ports & Adapters split as the other feature lanes:

- `domain/` keeps pure event/date grouping helpers.
- `ports/` defines typed loader boundaries.
- `adapters/` calls dedicated Tauri calendar commands through `$lib/platform`.
- `application/` owns use-case orchestration.
- `view-models/` owns Svelte page state for the Calendar route.

CalDAV credentials, multi-calendar discovery, and recurrence expansion stay behind the Tauri bridge. Renderer code calls
`get_caldav_config_status` and `list_calendar_events`; it does not read
`CALDAV_PASSWORD`, import Hermes dashboard clients, or tunnel through
`dashboard_request`.
