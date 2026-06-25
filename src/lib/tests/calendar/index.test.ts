import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvokeTauriCommand, mockListenTauriEvent } = vi.hoisted(() => ({
  mockInvokeTauriCommand: vi.fn(),
  mockListenTauriEvent: vi.fn()
}))

vi.mock('$lib/platform', () => ({
  invokeTauriCommand: mockInvokeTauriCommand,
  listenTauriEvent: mockListenTauriEvent
}))

import {
  calendarConfigStatus,
  calendarDateKey,
  calendarEventsForDate,
  calendarVisibleRange,
  createCalendarViewModel,
  listCalendarEvents,
  sortCalendarEvents,
  syncCalendarEvents,
  type CalendarEvent
} from '$lib/calendar'

function isoFromLocalDate(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day).toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

function localMonthRange(year: number, monthIndex: number): { end: string; start: string } {
  return {
    end: isoFromLocalDate(year, monthIndex + 1, 1),
    start: isoFromLocalDate(year, monthIndex, 1)
  }
}

function withTimeZone<T>(timeZone: string, run: () => T): T {
  vi.stubEnv('TZ', timeZone)
  try {
    return run()
  } finally {
    vi.unstubAllEnvs()
  }
}

const events: CalendarEvent[] = [
  {
    allDay: false,
    calendarName: 'Ops',
    description: 'Standup bridge',
    endsAt: '2026-06-25T16:30:00.000Z',
    location: 'Matrix room 7',
    startsAt: '2026-06-25T16:00:00.000Z',
    title: 'Daily sync',
    uid: 'sync-1'
  },
  {
    allDay: true,
    endsAt: '2026-06-26T00:00:00.000Z',
    startsAt: '2026-06-25T00:00:00.000Z',
    title: 'Launch window',
    uid: 'launch-1'
  }
]

describe('calendar CalDAV facade', () => {
  beforeEach(() => {
    mockInvokeTauriCommand.mockReset()
    mockListenTauriEvent.mockReset()
  })

  it('reports CalDAV configuration status without exposing credentials to the renderer', async () => {
    mockInvokeTauriCommand.mockResolvedValueOnce({
      configured: false,
      calendarUrl: '',
      username: '',
      hint: 'Set CALDAV_URL, CALDAV_USERNAME, and CALDAV_PASSWORD in the Tauri environment.'
    })

    await expect(calendarConfigStatus()).resolves.toMatchObject({
      configured: false,
      hint: expect.stringContaining('CALDAV_URL')
    })

    expect(mockInvokeTauriCommand).toHaveBeenCalledWith('get_caldav_config_status')
  })

  it('loads calendar events through the cached calendar Tauri command and sorts them for display', async () => {
    mockInvokeTauriCommand.mockResolvedValueOnce([events[0], events[1]])

    const range = { end: '2026-07-01T00:00:00.000Z', start: '2026-06-01T00:00:00.000Z' }

    await expect(listCalendarEvents(range)).resolves.toEqual([events[1], events[0]])
    expect(mockInvokeTauriCommand).toHaveBeenCalledWith('list_calendar_events', { range })
  })

  it('can request an explicit background CalDAV sync', async () => {
    mockInvokeTauriCommand.mockResolvedValueOnce({
      cachedSources: 2,
      lastSyncedAt: '2026-06-25T01:00:00Z',
      syncIntervalSeconds: 1800,
      syncing: false
    })

    await expect(syncCalendarEvents()).resolves.toMatchObject({ cachedSources: 2, syncing: false })
    expect(mockInvokeTauriCommand).toHaveBeenCalledWith('sync_calendar_events')
  })
})

describe('calendar domain helpers', () => {
  it('groups all-day and timed events by selected calendar date', () => {
    withTimeZone('UTC', () => {
      expect(calendarEventsForDate(events, '2026-06-25').map(event => event.uid)).toEqual(['launch-1', 'sync-1'])
      expect(calendarEventsForDate(events, '2026-06-26')).toEqual([])
    })
  })

  it('derives month fetch windows and stable day keys from the system timezone', () => {
    const range = calendarVisibleRange('2026-06-15')

    expect(range).toEqual(localMonthRange(2026, 5))
    expect(calendarDateKey('2026-06-25')).toBe('2026-06-25')
  })

  it('uses the system timezone for instant date keys, month ranges, and timed day grouping', () => {
    withTimeZone('America/Los_Angeles', () => {
      const lateNightEvent: CalendarEvent = {
        allDay: false,
        endsAt: '2026-06-25T01:00:00.000Z',
        startsAt: '2026-06-25T00:30:00.000Z',
        title: 'Late local event',
        uid: 'late-local'
      }
      const allDayEvent: CalendarEvent = {
        allDay: true,
        endsAt: '2026-06-26T00:00:00.000Z',
        startsAt: '2026-06-25T00:00:00.000Z',
        title: 'Local all day event',
        uid: 'local-all-day'
      }

      expect(calendarDateKey('2026-06-25T00:30:00.000Z')).toBe('2026-06-24')
      expect(calendarDateKey(new Date('2026-06-01T06:30:00.000Z'))).toBe('2026-05-31')
      expect(calendarVisibleRange('2026-06-15')).toEqual({
        end: '2026-07-01T07:00:00.000Z',
        start: '2026-06-01T07:00:00.000Z'
      })
      expect(calendarEventsForDate([lateNightEvent], '2026-06-24').map(event => event.uid)).toEqual(['late-local'])
      expect(calendarEventsForDate([lateNightEvent], '2026-06-25')).toEqual([])
      expect(calendarEventsForDate([allDayEvent], '2026-06-25').map(event => event.uid)).toEqual(['local-all-day'])
      expect(calendarEventsForDate([allDayEvent], '2026-06-24')).toEqual([])
    })
  })

  it('sorts all-day events before timed events and preserves chronological order', () => {
    expect(sortCalendarEvents([events[0], events[1]]).map(event => event.uid)).toEqual(['launch-1', 'sync-1'])
  })
})

describe('calendar view model', () => {
  it('refreshes the currently visible month instead of the originally selected day', async () => {
    const loadEvents = vi.fn().mockResolvedValue([])
    const loadStatus = vi.fn().mockResolvedValue({
      configured: true,
      calendarUrl: 'https://calendar.example.test/caldav/home/',
      username: 'operator'
    })
    const viewModel = createCalendarViewModel({
      loadEvents,
      loadStatus,
      now: () => new Date('2026-06-25T12:00:00.000Z')
    })

    viewModel.setVisibleAnchor('2026-07-01')
    await viewModel.refresh()

    expect(loadEvents).toHaveBeenCalledWith(localMonthRange(2026, 6))
  })

  it('updates visible anchors locally without loading events', () => {
    const loadEvents = vi.fn().mockResolvedValue([])
    const viewModel = createCalendarViewModel({
      loadEvents,
      now: () => new Date('2026-06-25T12:00:00.000Z')
    })

    viewModel.setVisibleAnchor('2026-06-01')
    expect(viewModel.range).toEqual(localMonthRange(2026, 5))

    viewModel.setVisibleAnchor('2026-07-31')
    expect(viewModel.range).toEqual(localMonthRange(2026, 6))
    expect(loadEvents).not.toHaveBeenCalled()
  })

  it('runs explicit syncs and reloads cached events afterward', async () => {
    const loadEvents = vi.fn().mockResolvedValue(events)
    const syncedStatus = {
      cachedSources: 2,
      lastSyncedAt: '2026-06-25T01:00:00Z',
      syncIntervalSeconds: 1800,
      syncing: false
    }
    const loadStatus = vi
      .fn()
      .mockResolvedValueOnce({
        configured: true,
        calendarUrl: 'https://calendar.example.test/caldav/home/',
        username: 'operator'
      })
      .mockResolvedValueOnce({
        ...syncedStatus,
        configured: true,
        calendarUrl: 'https://calendar.example.test/caldav/home/',
        username: 'operator'
      })
    const syncEvents = vi.fn().mockResolvedValue(syncedStatus)
    const viewModel = createCalendarViewModel({
      loadEvents,
      loadStatus,
      now: () => new Date('2026-06-25T12:00:00.000Z'),
      syncEvents
    })

    await viewModel.syncNow()

    expect(syncEvents).toHaveBeenCalledOnce()
    expect(loadEvents).toHaveBeenCalledWith(localMonthRange(2026, 5))
    expect(viewModel.configStatus?.cachedSources).toBe(2)
    expect(viewModel.configStatus?.lastSyncedAt).toBe('2026-06-25T01:00:00Z')
  })

  it('tracks loading, empty, config-missing, and error states around the CalDAV use cases', async () => {
    const loadEvents = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('CalDAV returned 401'))
    const loadStatus = vi
      .fn()
      .mockResolvedValueOnce({ configured: false, hint: 'Set CALDAV_URL' })
      .mockResolvedValueOnce({
        configured: true,
        calendarUrl: 'https://calendar.example.test/caldav/home/',
        username: 'operator'
      })
      .mockResolvedValueOnce({
        configured: true,
        calendarUrl: 'https://calendar.example.test/caldav/home/',
        username: 'operator'
      })

    const viewModel = createCalendarViewModel({
      loadEvents,
      loadStatus,
      now: () => new Date('2026-06-25T12:00:00.000Z')
    })

    await viewModel.refresh()
    expect(viewModel.configured).toBe(false)
    expect(viewModel.statusLabel).toBe('config missing')
    expect(viewModel.empty).toBe(true)
    expect(loadEvents).not.toHaveBeenCalled()

    await viewModel.refresh()
    expect(viewModel.configured).toBe(true)
    expect(viewModel.statusLabel).toBe('0 events')
    expect(viewModel.empty).toBe(true)
    expect(loadEvents).toHaveBeenCalledWith(localMonthRange(2026, 5))

    await viewModel.refresh()
    expect(viewModel.error).toContain('CalDAV returned 401')
    expect(viewModel.statusLabel).toBe('error')
    expect(viewModel.loading).toBe(false)
  })
})
