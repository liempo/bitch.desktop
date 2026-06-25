# Calendar / CalDAV lane

The CALENDAR route is backed by a dedicated CalDAV lane rather than the Hermes
dashboard bridge. Renderer code imports `$lib/calendar` and calls typed use cases;
Tauri owns CalDAV credentials and HTTP REPORT requests.

## Configuration

Set these values in the Tauri environment or `.env`:

- `CALDAV_URL` — full CalDAV calendar collection URL, for example
  `https://calendar.example.test/dav/user/calendar/`.
- `CALDAV_USERNAME` — CalDAV username. `CALDAV_USER` is accepted as a fallback.
- `CALDAV_PASSWORD` — CalDAV password or app password.
- `CALDAV_DISPLAY_NAME` — optional label shown on imported events.

The current bridge expects `CALDAV_URL` to point at a concrete calendar
collection. Principal discovery can be added later behind the same lane without
changing renderer call sites.

## Command surface

- `get_caldav_config_status` returns whether the bridge has enough non-secret
  configuration to sync events.
- `list_calendar_events` accepts `{ start, end }` ISO timestamps and performs a
  CalDAV `calendar-query` REPORT with HTTP Basic auth. It returns normalized
  event rows with `uid`, `title`, `startsAt`, `endsAt`, `allDay`, optional
  `location`, `description`, `calendarName`, and `sourceUrl`.

No CalDAV request goes through `dashboard_request`, and the renderer never reads
`CALDAV_PASSWORD`.
