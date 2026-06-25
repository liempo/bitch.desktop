# Calendar / CalDAV lane

The CALENDAR route is backed by a dedicated CalDAV lane rather than the Hermes
dashboard bridge. Renderer code imports `$lib/calendar` and calls typed use cases;
Tauri owns CalDAV credentials, calendar discovery, and HTTP REPORT requests via `minicaldav`.

## Configuration

Set these values in the Tauri environment or `.env`:

- `CALDAV_URL` — CalDAV server/principal endpoint URL for discovery, for example
  `https://calendar.example.test/dav/user/`. A concrete calendar collection URL is also accepted as a fallback.
- `CALDAV_USERNAME` — CalDAV username. `CALDAV_USER` is accepted as a fallback.
- `CALDAV_PASSWORD` — CalDAV password or app password.
- `CALDAV_DISPLAY_NAME` — optional fallback label when a discovered calendar has no display name.

The bridge uses `minicaldav::get_calendars` to discover all VEVENT-capable calendars from `CALDAV_URL`, then loads each calendar with `minicaldav::get_events`. If discovery yields no calendars, it falls back to treating `CALDAV_URL` as a direct collection URL.

## Command surface

- `get_caldav_config_status` returns whether the bridge has enough non-secret
  configuration to sync events.
- `list_calendar_events` accepts `{ start, end }` ISO timestamps, discovers all
  calendars, performs CalDAV event REPORTs with HTTP Basic auth, and expands
  RRULE/RDATE/EXDATE recurrences into visible occurrences with the RFC-aware `rrule` crate. It returns normalized
  event rows with `uid`, `title`, `startsAt`, `endsAt`, `allDay`, optional
  `location`, `description`, `calendarName`, and `sourceUrl`.

No CalDAV request goes through `dashboard_request`, and the renderer never reads
`CALDAV_PASSWORD`.
