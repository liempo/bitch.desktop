import { CalendarDate } from '@internationalized/date'

import { calendarDateKey, calendarEventOverlapsDate, sortCalendarEvents, type CalendarEvent } from './events'

export interface VirtualAgendaGrid {
  rowCount: number
  startKey: string
}

export interface VirtualAgendaRow {
  dateKeys: string[]
  index: number
  key: string
  label: string
}

export interface VirtualAgendaWindow {
  bottomSpacerHeight: number
  rows: VirtualAgendaRow[]
  topSpacerHeight: number
}

export interface MonthDayCell {
  date: CalendarDate
  dateKey: string
  month: CalendarDate
}

export type MonthWeek = MonthDayCell[]

export interface VirtualMonthGrid {
  startKey: string
  weekCount: number
}

export interface VirtualWeekRow {
  index: number
  monthKey: string
  startKey: string
  week: MonthWeek
}

export interface VirtualWeekWindow {
  bottomSpacerHeight: number
  rows: VirtualWeekRow[]
  topSpacerHeight: number
}

export interface VirtualWindowOptions {
  overscanRows: number
  rowHeight: number
}

export interface MonthScrollOptions {
  loaderSlotHeight: number
  rowHeight: number
}

export interface HighlightedMonthOptions extends MonthScrollOptions {
  fullRowVisibilityEpsilon: number
}

export interface HighlightedAgendaOptions {
  rowHeight: number
}

export function dateKeyFromLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function calendarDateFromLocalDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function monthStartKey(dateKey: string): string {
  return `${monthKey(dateKey)}-01`
}

export function monthStartKeyWithOffset(dateKey: string, offset: number): string {
  const date = localDateFromKey(dateKey)
  return dateKeyFromLocalDate(new Date(date.getFullYear(), date.getMonth() + offset, 1))
}

export function monthIndex(dateKey: string): number {
  const date = localDateFromKey(dateKey)
  return date.getFullYear() * 12 + date.getMonth()
}

export function monthOffsetFromAnchor(anchorKey: string, dateKey: string): number {
  return monthIndex(dateKey) - monthIndex(anchorKey)
}

export function localDateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(part => Number(part))
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function localNoonMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime()
}

export function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((localNoonMs(end) - localNoonMs(start)) / 86_400_000))
}

export function startOfWeek(date: Date): Date {
  const start = new Date(date)
  start.setDate(date.getDate() - date.getDay())
  return start
}

export function endOfWeek(date: Date): Date {
  const end = new Date(date)
  end.setDate(date.getDate() + (6 - date.getDay()))
  return end
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function eventsForDateKeys(
  eventsByDate: ReadonlyMap<string, readonly CalendarEvent[]>,
  dateKeys: readonly string[]
): CalendarEvent[] {
  const eventsByUid = new Map<string, CalendarEvent>()
  for (const dateKey of dateKeys) {
    for (const event of eventsByDate.get(dateKey) ?? []) {
      eventsByUid.set(event.uid, event)
    }
  }

  return sortCalendarEvents([...eventsByUid.values()])
}

export function monthEventMap(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const eventsByDate = new Map<string, CalendarEvent[]>()

  for (const event of events) {
    const startKey = calendarDateKey(event.startsAt)
    const endKey = calendarDateKey(event.endsAt) || startKey
    if (!startKey) continue

    const cursor = localDateFromKey(startKey)
    const end = localDateFromKey(endKey)
    if (end < cursor) end.setTime(cursor.getTime())

    for (let days = 0; cursor <= end && days < 3700; days += 1) {
      const dateKey = dateKeyFromLocalDate(cursor)
      if (calendarEventOverlapsDate(event, dateKey)) {
        const dateEvents = eventsByDate.get(dateKey) ?? []
        dateEvents.push(event)
        eventsByDate.set(dateKey, dateEvents)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  for (const [dateKey, dateEvents] of eventsByDate.entries()) {
    if (dateEvents.length > 1) eventsByDate.set(dateKey, sortCalendarEvents(dateEvents))
  }

  return eventsByDate
}

export function createVirtualMonthGrid(anchorKey: string, monthsBefore: number, monthsAfter: number): VirtualMonthGrid {
  const anchor = localDateFromKey(anchorKey)
  const firstOfStartMonth = new Date(anchor.getFullYear(), anchor.getMonth() - Math.max(0, Math.floor(monthsBefore)), 1)
  const lastOfEndMonth = new Date(anchor.getFullYear(), anchor.getMonth() + Math.max(0, Math.floor(monthsAfter)) + 1, 0)
  const start = startOfWeek(firstOfStartMonth)
  const end = endOfWeek(lastOfEndMonth)

  return {
    startKey: dateKeyFromLocalDate(start),
    weekCount: Math.max(1, Math.floor(daysBetween(start, end) / 7) + 1)
  }
}

export function createVirtualAgendaGrid(anchorKey: string, windowRows: number): VirtualAgendaGrid {
  const normalizedWindowRows = Math.max(0, Math.floor(windowRows))
  const start = localDateFromKey(anchorKey)
  start.setDate(start.getDate() - normalizedWindowRows)

  return {
    rowCount: normalizedWindowRows * 2 + 1,
    startKey: dateKeyFromLocalDate(start)
  }
}

export function createVirtualAgendaWindow(
  grid: VirtualAgendaGrid,
  scrollTop: number,
  viewportHeight: number,
  options: VirtualWindowOptions
): VirtualAgendaWindow {
  const rowHeight = options.rowHeight
  const firstVisibleIndex = clamp(
    Math.floor(scrollTop / rowHeight) - options.overscanRows,
    0,
    Math.max(0, grid.rowCount - 1)
  )
  const visibleRowCount = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight) + options.overscanRows * 2
  const endIndex = Math.min(grid.rowCount, firstVisibleIndex + visibleRowCount)
  const rows: VirtualAgendaRow[] = []

  for (let index = firstVisibleIndex; index < endIndex; index += 1) {
    rows.push(agendaRowAtIndex(grid, index))
  }

  return {
    bottomSpacerHeight: Math.max(0, (grid.rowCount - endIndex) * rowHeight),
    rows,
    topSpacerHeight: firstVisibleIndex * rowHeight
  }
}

export function agendaRowAtIndex(grid: VirtualAgendaGrid, index: number): VirtualAgendaRow {
  const cursor = localDateFromKey(grid.startKey)
  cursor.setDate(cursor.getDate() + index)
  const key = dateKeyFromLocalDate(cursor)

  return {
    dateKeys: [key],
    index,
    key,
    label: formatDateLabel(key)
  }
}

export function agendaRowIndexForDate(dateKey: string, grid: VirtualAgendaGrid): number {
  const gridStart = localDateFromKey(grid.startKey)
  const target = localDateFromKey(dateKey)
  const rowOffset = daysBetween(gridStart, target)
  return clamp(rowOffset, 0, grid.rowCount - 1)
}

export function agendaScrollTopForDate(dateKey: string, grid: VirtualAgendaGrid, rowHeight: number): number {
  return agendaRowIndexForDate(dateKey, grid) * rowHeight
}

export function highlightedAgendaKey(
  grid: VirtualAgendaGrid,
  scrollTop: number,
  viewportHeight: number,
  options: HighlightedAgendaOptions
): string {
  const rowHeight = options.rowHeight
  const sampleTop = scrollTop + Math.min(viewportHeight * 0.35, rowHeight * 0.8)
  const rowIndex = clamp(Math.floor(sampleTop / rowHeight), 0, grid.rowCount - 1)
  return agendaRowAtIndex(grid, rowIndex).key
}

export function createVirtualWeekWindow(
  grid: VirtualMonthGrid,
  scrollTop: number,
  viewportHeight: number,
  options: VirtualWindowOptions
): VirtualWeekWindow {
  const rowHeight = options.rowHeight
  const firstVisibleIndex = clamp(
    Math.floor(scrollTop / rowHeight) - options.overscanRows,
    0,
    Math.max(0, grid.weekCount - 1)
  )
  const visibleRowCount = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight) + options.overscanRows * 2
  const endIndex = Math.min(grid.weekCount, firstVisibleIndex + visibleRowCount)
  const rows: VirtualWeekRow[] = []

  for (let index = firstVisibleIndex; index < endIndex; index += 1) {
    const week = monthWeekAtIndex(grid, index)
    rows.push({
      index,
      monthKey: dominantMonthKey(week),
      startKey: week[0]?.dateKey ?? '',
      week
    })
  }

  return {
    bottomSpacerHeight: Math.max(0, (grid.weekCount - endIndex) * rowHeight),
    rows,
    topSpacerHeight: firstVisibleIndex * rowHeight
  }
}

export function monthWeekAtIndex(grid: VirtualMonthGrid, index: number): MonthWeek {
  const cursor = localDateFromKey(grid.startKey)
  cursor.setDate(cursor.getDate() + index * 7)
  return monthWeekFromStartDate(cursor)
}

export function monthWeekFromStartDate(startDate: Date): MonthWeek {
  const cursor = new Date(startDate)
  const week: MonthWeek = []

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(cursor)
    const dateKey = dateKeyFromLocalDate(date)
    const calendarDate = calendarDateFromLocalDate(date)
    week.push({ date: calendarDate, dateKey, month: new CalendarDate(calendarDate.year, calendarDate.month, 1) })
    cursor.setDate(cursor.getDate() + 1)
  }

  return week
}

export function dominantMonthKey(week: MonthWeek, fallback = ''): string {
  const firstOfMonth = week.find(cell => cell.dateKey.endsWith('-01'))
  if (firstOfMonth) return monthStartKey(firstOfMonth.dateKey)

  const counts = new Map<string, number>()
  for (const cell of week) counts.set(monthStartKey(cell.dateKey), (counts.get(monthStartKey(cell.dateKey)) ?? 0) + 1)

  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
    fallback
  )
}

export function monthWeekIndex(grid: VirtualMonthGrid, monthKeyValue: string): number {
  const firstOfMonth = localDateFromKey(monthStartKey(monthKeyValue))
  const firstWeekStart = startOfWeek(firstOfMonth)
  const gridStart = localDateFromKey(grid.startKey)

  return clamp(Math.round(daysBetween(gridStart, firstWeekStart) / 7), 0, grid.weekCount - 1)
}

export function monthScrollTopForMonth(
  grid: VirtualMonthGrid,
  monthKeyValue: string,
  options: MonthScrollOptions
): number {
  return options.loaderSlotHeight + monthWeekIndex(grid, monthStartKey(monthKeyValue)) * options.rowHeight
}

export function monthGridScrollTop(scrollTop: number, loaderSlotHeight: number): number {
  return Math.max(0, scrollTop - loaderSlotHeight)
}

export function highlightedMonthKey(
  grid: VirtualMonthGrid,
  scrollTop: number,
  options: HighlightedMonthOptions
): string {
  const firstFullVisibleIndex = clamp(
    Math.ceil(
      (monthGridScrollTop(scrollTop, options.loaderSlotHeight) - options.fullRowVisibilityEpsilon) / options.rowHeight
    ),
    0,
    grid.weekCount - 1
  )

  return dominantMonthKey(monthWeekAtIndex(grid, firstFullVisibleIndex))
}

function formatDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short'
  }).format(localDateFromKey(dateKey))
}
