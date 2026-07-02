import { describe, expect, it, vi } from 'vitest'

import {
  agendaRowAtIndex,
  agendaRowIndexForDate,
  createVirtualAgendaGrid,
  createVirtualAgendaWindow,
  createVirtualMonthGrid,
  createVirtualWeekWindow,
  dominantMonthKey,
  eventsForDateKeys,
  highlightedMonthKey,
  monthEventMap,
  monthScrollTopForMonth,
  monthWeekAtIndex,
  monthWeekIndex,
  type CalendarEvent
} from '$lib/calendar'

function withTimeZone<T>(timeZone: string, run: () => T): T {
  vi.stubEnv('TZ', timeZone)
  try {
    return run()
  } finally {
    vi.unstubAllEnvs()
  }
}

describe('calendar virtual month grid', () => {
  it.each([
    {
      anchorKey: '2026-06-15',
      monthsAfter: 1,
      monthsBefore: 1,
      startKey: '2026-04-26',
      weekCount: 14
    },
    {
      anchorKey: '2026-03-15',
      monthsAfter: -1,
      monthsBefore: 0.8,
      startKey: '2026-03-01',
      weekCount: 5
    }
  ])('builds a Sunday-start continuous month grid for $anchorKey', expected => {
    expect(createVirtualMonthGrid(expected.anchorKey, expected.monthsBefore, expected.monthsAfter)).toEqual({
      startKey: expected.startKey,
      weekCount: expected.weekCount
    })
  })

  it('materializes weeks and marks the month that owns boundary rows', () => {
    const grid = createVirtualMonthGrid('2026-06-15', 1, 1)

    const firstWeek = monthWeekAtIndex(grid, 0)
    expect(firstWeek.map(cell => cell.dateKey)).toEqual([
      '2026-04-26',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02'
    ])
    expect(firstWeek.map(cell => cell.month.toString())).toEqual([
      '2026-04-01',
      '2026-04-01',
      '2026-04-01',
      '2026-04-01',
      '2026-04-01',
      '2026-05-01',
      '2026-05-01'
    ])
    expect(dominantMonthKey(firstWeek)).toBe('2026-05-01')

    const juneWeekIndex = monthWeekIndex(grid, '2026-06-01')
    expect(juneWeekIndex).toBe(5)
    expect(monthWeekAtIndex(grid, juneWeekIndex).map(cell => cell.dateKey)).toEqual([
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06'
    ])
    expect(dominantMonthKey(monthWeekAtIndex(grid, juneWeekIndex))).toBe('2026-06-01')
  })

  it('derives virtual week windows and month scroll positions from row metrics', () => {
    const grid = createVirtualMonthGrid('2026-06-15', 1, 1)
    const rowHeight = 112
    const loaderSlotHeight = 28

    expect(monthScrollTopForMonth(grid, '2026-06-01', { loaderSlotHeight, rowHeight })).toBe(588)
    expect(
      highlightedMonthKey(grid, 28 + 5 * rowHeight, { fullRowVisibilityEpsilon: 1, loaderSlotHeight, rowHeight })
    ).toBe('2026-06-01')
    expect(
      highlightedMonthKey(grid, 28 + 4 * rowHeight + 1, { fullRowVisibilityEpsilon: 1, loaderSlotHeight, rowHeight })
    ).toBe('2026-05-01')

    expect(createVirtualWeekWindow(grid, 5 * rowHeight, 2 * rowHeight, { overscanRows: 1, rowHeight })).toMatchObject({
      bottomSpacerHeight: 672,
      topSpacerHeight: 448,
      rows: [
        { index: 4, monthKey: '2026-05-01', startKey: '2026-05-24' },
        { index: 5, monthKey: '2026-06-01', startKey: '2026-05-31' },
        { index: 6, monthKey: '2026-06-01', startKey: '2026-06-07' },
        { index: 7, monthKey: '2026-06-01', startKey: '2026-06-14' }
      ]
    })
  })
})

describe('calendar virtual agenda grid', () => {
  it('creates a centered day window and clamps date lookups to available rows', () => {
    const grid = createVirtualAgendaGrid('2026-06-15', 2)

    expect(grid).toEqual({ rowCount: 5, startKey: '2026-06-13' })
    expect(agendaRowAtIndex(grid, 2)).toMatchObject({
      dateKeys: ['2026-06-15'],
      index: 2,
      key: '2026-06-15'
    })
    expect(agendaRowIndexForDate('2026-06-12', grid)).toBe(0)
    expect(agendaRowIndexForDate('2026-06-17', grid)).toBe(4)
  })

  it('derives agenda virtual windows from scroll position and overscan settings', () => {
    const grid = createVirtualAgendaGrid('2026-06-15', 2)

    expect(createVirtualAgendaWindow(grid, 360, 360, { overscanRows: 1, rowHeight: 360 })).toMatchObject({
      bottomSpacerHeight: 720,
      topSpacerHeight: 0,
      rows: [
        { index: 0, key: '2026-06-13' },
        { index: 1, key: '2026-06-14' },
        { index: 2, key: '2026-06-15' }
      ]
    })
  })
})

describe('calendar month event mapping', () => {
  const events: CalendarEvent[] = [
    {
      allDay: false,
      endsAt: '2026-06-26T01:00:00.000Z',
      startsAt: '2026-06-25T23:00:00.000Z',
      title: 'Overnight deploy',
      uid: 'deploy'
    },
    {
      allDay: true,
      endsAt: '2026-06-27',
      startsAt: '2026-06-25',
      title: 'Maintenance window',
      uid: 'maintenance'
    }
  ]

  it('maps multi-day events to every overlapping date and deduplicates agenda rows', () => {
    withTimeZone('UTC', () => {
      const eventsByDate = monthEventMap(events)

      expect(eventsByDate.get('2026-06-25')?.map(event => event.uid)).toEqual(['maintenance', 'deploy'])
      expect(eventsByDate.get('2026-06-26')?.map(event => event.uid)).toEqual(['maintenance', 'deploy'])
      expect(eventsByDate.get('2026-06-27')).toBeUndefined()
      expect(eventsForDateKeys(eventsByDate, ['2026-06-25', '2026-06-26']).map(event => event.uid)).toEqual([
        'maintenance',
        'deploy'
      ])
    })
  })
})
