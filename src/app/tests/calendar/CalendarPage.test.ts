import { describe, expect, it } from 'vitest'

import calendarPageSource from '../../calendar/CalendarPage.svelte?raw'
import calendarIndexSource from '$lib/calendar/index.ts?raw'
import calendarAdapterSource from '$lib/calendar/adapters/caldav-calendar-adapter.ts?raw'

describe('Calendar page source contract', () => {
  it('uses Bits UI calendar primitives with BITCH theme states instead of the placeholder panel', () => {
    expect(calendarPageSource).toContain("import { Calendar } from 'bits-ui'")
    expect(calendarPageSource).toContain('<Calendar.Root')
    expect(calendarPageSource).toContain('<Calendar.Header')
    expect(calendarPageSource).toContain('<Calendar.PrevButton')
    expect(calendarPageSource).toContain('<Calendar.NextButton')
    expect(calendarPageSource).toContain('<Calendar.Grid')
    expect(calendarPageSource).toContain('<Calendar.Day')
    expect(calendarPageSource).toContain('{#snippet children({ months, weekdays })}')
    expect(calendarPageSource).toContain('data-[selected]:border-primary')
    expect(calendarPageSource).toContain('focus-visible:outline-focus')
    expect(calendarPageSource).toContain('bg-chat-scroll/40')
    expect(calendarPageSource).toContain('CALDAV')
    expect(calendarPageSource).toContain('config missing')
    expect(calendarPageSource).toContain('No events returned for this date')
    expect(calendarPageSource).not.toContain("timeZone: 'UTC'")
    expect(calendarPageSource).not.toContain('Chronos panel queued')
    expect(calendarPageSource).not.toContain('fake feed')
  })

  it('loads through the public calendar facade and a dedicated CalDAV Tauri command', () => {
    expect(calendarPageSource).toContain("from '$lib/calendar'")
    expect(calendarIndexSource).toContain('./adapters/caldav-calendar-adapter')
    expect(calendarAdapterSource).toContain('get_caldav_config_status')
    expect(calendarAdapterSource).toContain('list_calendar_events')
    expect(calendarAdapterSource).toContain('sync_calendar_events')
    expect(calendarAdapterSource).toContain('calendar-sync-updated')
    expect(calendarAdapterSource).not.toContain('dashboard_request')
    expect(calendarAdapterSource).not.toContain('$lib/hermes')
  })

  it('loads cached data on initial load and syncs only from the explicit button or background event', () => {
    const handlerStart = calendarPageSource.indexOf('function handleVisibleMonthChange')
    const handlerEnd = calendarPageSource.indexOf('function dayEventCount', handlerStart)
    const visibleMonthHandler = calendarPageSource.slice(handlerStart, handlerEnd)

    expect(calendarPageSource).toContain('onMount(() => {\n    let disposed = false')
    expect(calendarPageSource).toContain('let unlisten')
    expect(calendarPageSource).toContain('void viewModel.refresh()')
    expect(calendarPageSource).toContain('listenCalendarSyncUpdates')
    expect(calendarPageSource).toContain('onclick={() => void viewModel.syncNow()}')
    expect(calendarPageSource).toContain('aria-label="Sync calendar"')
    expect(calendarPageSource).toContain('title="Sync calendar"')
    expect(calendarPageSource).toContain('<Button size="icon" variant="primary"')
    expect(calendarPageSource).not.toContain('>Refresh</Button>')
    expect(calendarPageSource).not.toContain('onclick={() => void viewModel.refresh()}')
    expect(visibleMonthHandler).toContain('viewModel.setVisibleAnchor(value.toString())')
    expect(visibleMonthHandler).not.toContain('viewModel.refresh')
  })
})
