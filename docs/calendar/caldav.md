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
- `CALDAV_SYNC_INTERVAL` — optional background sync interval in seconds. Defaults to `1800` (30 minutes). Set `0` to sync once on app startup and only again when the Calendar page sync button is clicked.

The bridge uses `minicaldav::get_calendars` to discover all VEVENT-capable calendars from `CALDAV_URL`, then loads each calendar with `minicaldav::get_events`. If discovery yields no calendars, it falls back to treating `CALDAV_URL` as a direct collection URL.

Sync happens as a whole-calendar background job on app startup and then on `CALDAV_SYNC_INTERVAL`. The raw VEVENT cache is persisted under the local app cache directory so Calendar page range reads are fast and do not trigger CalDAV network requests.

## Renderer month-view strategy

The month view keeps calendar geometry separate from event data:

- The continuous day grid is generated locally in `src/app/calendar/CalendarPage.svelte` from date math. It must not wait for CalDAV, cache reads, or network sync before rendering days.
- The visible month highlight is derived from the first fully visible week row. If the top row is partially clipped, the next full row determines the active month.
- Week rows are virtualized by scroll position with fixed row heights and spacer rows. This keeps the DOM small even when the user scrolls far backward or forward.
- Event data is loaded from the local Tauri cache in the background. Initial cache reads cover six months before and six months after the visible anchor; scrolling near either edge extends the event cache window in larger background steps.
- Background event loads must not clear existing events, show a blocking page loader, or trigger CalDAV network requests. The only network sync path is the background worker or explicit sync button.
- Lazy edge loaders are normal scroll content with reserved slots, so toggling a spinner does not insert layout above the visible rows or cause scroll jumps.

## Command surface

- `get_caldav_config_status` returns whether the bridge has enough non-secret
  configuration to sync events plus cache metadata such as `cachedSources`, `lastSyncedAt`, and `syncing`.
- `list_calendar_events` accepts `{ start, end }` ISO timestamps and expands the local raw VEVENT cache into visible occurrences with the RFC-aware `rrule` crate. It does not perform CalDAV network requests.
- `sync_calendar_events` triggers an explicit whole-calendar sync, updates the local cache, and returns sync metadata.

No CalDAV request goes through `dashboard_request`, and the renderer never reads
`CALDAV_PASSWORD`.
