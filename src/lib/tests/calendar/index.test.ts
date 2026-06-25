import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvokeTauriCommand } = vi.hoisted(() => ({
  mockInvokeTauriCommand: vi.fn()
}))

vi.mock('$lib/platform', () => ({
  invokeTauriCommand: mockInvokeTauriCommand
}))

import {
  calendarConfigStatus,
  calendarDateKey,
  calendarEventsForDate,
  calendarVisibleRange,
  createCalendarViewModel,
  listCalendarEvents,
  sortCalendarEvents,
  type CalendarEvent
} from '$lib/calendar'

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

  it('loads calendar events through the dedicated CalDAV Tauri command and sorts them for display', async () => {
    mockInvokeTauriCommand.mockResolvedValueOnce([events[0], events[1]])

    const range = { end: '2026-07-01T00:00:00.000Z', start: '2026-06-01T00:00:00.000Z' }

    await expect(listCalendarEvents(range)).resolves.toEqual([events[1], events[0]])
    expect(mockInvokeTauriCommand).toHaveBeenCalledWith('list_calendar_events', { range })
  })
})

describe('calendar domain helpers', () => {
  it('groups all-day and timed events by selected calendar date', () => {
    expect(calendarEventsForDate(events, '2026-06-25').map(event => event.uid)).toEqual(['launch-1', 'sync-1'])
    expect(calendarEventsForDate(events, '2026-06-26')).toEqual([])
  })

  it('derives month fetch windows and stable day keys without browser globals', () => {
    const range = calendarVisibleRange('2026-06-15')

    expect(range).toEqual({
      end: '2026-07-01T00:00:00.000Z',
      start: '2026-06-01T00:00:00.000Z'
    })
    expect(calendarDateKey('2026-06-25T16:00:00.000Z')).toBe('2026-06-25')
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

    expect(loadEvents).toHaveBeenCalledWith({
      end: '2026-08-01T00:00:00.000Z',
      start: '2026-07-01T00:00:00.000Z'
    })
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
    expect(loadEvents).toHaveBeenCalledWith({
      end: '2026-07-01T00:00:00.000Z',
      start: '2026-06-01T00:00:00.000Z'
    })

    await viewModel.refresh()
    expect(viewModel.error).toContain('CalDAV returned 401')
    expect(viewModel.statusLabel).toBe('error')
    expect(viewModel.loading).toBe(false)
  })
})
