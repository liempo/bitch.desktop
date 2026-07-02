# CalDAV Calendar Lane

## Configuration

Set these values under the `calendar` section in `~/.bitch/config.yaml`:

```yaml
calendar:
  url: https://calendar.example.test/dav/user/
  username: operator
  password: replace-me
  displayName: Ops
  syncIntervalSeconds: 1800
```

- `calendar.url` — CalDAV server/principal endpoint URL for discovery. A concrete calendar collection URL is also accepted as a fallback.
- `calendar.username` — CalDAV username. `calendar.user` is accepted as a fallback.
- `calendar.password` — CalDAV password or app password.
- `calendar.displayName` — optional fallback label when a discovered calendar has no display name.
- `calendar.syncIntervalSeconds` — optional background sync interval in seconds. Defaults to `1800` (30 minutes). Set `0` to sync once on app startup and only again when the Calendar page sync button is clicked.

The bridge uses `minicaldav::get_calendars` to discover all VEVENT-capable calendars from `calendar.url`, then loads each calendar with `minicaldav::get_events`. If discovery yields no calendars, it falls back to treating `calendar.url` as a direct collection URL.

Sync happens as a whole-calendar background job on app startup and then on `calendar.syncIntervalSeconds`. The raw VEVENT cache is persisted under the local app cache directory so Calendar page range reads are fast and do not trigger CalDAV network requests.

## Renderer month-view strategy

The Calendar route renders an infinite-scroll month surface by virtualizing week rows around an anchor month. Range reads come from the native cache via `list_calendar_events`; scrolling the month view does not call CalDAV.

The visible event model is intentionally small: all-day and timed events are normalized to start/end timestamps, sorted per day, and rendered as density-aware chips in the month grid. The sync button calls `sync_calendar_events` explicitly and then refreshes the visible range.

## Bridge contract

- `get_caldav_config_status` returns whether the bridge has enough non-secret configuration to sync events plus cache metadata such as `cachedSources`, `lastSyncedAt`, and `syncing`.
- `list_calendar_events` accepts `{ start, end }` ISO timestamps and expands the local raw VEVENT cache into visible occurrences with the RFC-aware `rrule` crate. It does not perform CalDAV network requests.
- `sync_calendar_events` triggers an explicit whole-calendar sync, updates the local cache, and returns sync metadata.

No CalDAV request goes through `dashboard_request`, and the renderer never reads `calendar.password`.
