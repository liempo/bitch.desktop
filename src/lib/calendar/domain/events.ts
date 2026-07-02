export interface CalendarEvent {
  allDay: boolean
  calendarName?: null | string
  description?: null | string
  endsAt: string
  location?: null | string
  sourceUrl?: null | string
  startsAt: string
  title: string
  uid: string
}

export interface CalendarEventRange {
  end: string
  start: string
}

export interface CalendarVisibleRangeOptions {
  monthsAfter?: number
  monthsBefore?: number
}

export interface CalendarSyncStatus {
  cachedSources: number
  lastError?: null | string
  lastSyncedAt?: null | string
  syncIntervalSeconds: number
  syncing: boolean
}

export interface CalendarConfigStatus {
  cachedSources?: number
  calendarUrl?: string
  configured: boolean
  hint?: string
  lastSyncError?: null | string
  lastSyncedAt?: null | string
  syncIntervalSeconds?: number
  syncing?: boolean
  username?: string
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function clean(value: null | string | undefined): string {
  return value?.trim() ?? ''
}

function dateKeyParts(value: string): [number, number, number] | null {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return null

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isoFromLocalDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

function localDateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function localDateStartMs(parts: [number, number, number]): number {
  const [year, month, day] = parts
  return new Date(year, month - 1, day).getTime()
}

function nextLocalDateStartMs(parts: [number, number, number]): number {
  const [year, month, day] = parts
  return new Date(year, month - 1, day + 1).getTime()
}

function startOfLocalDate(dateKey: string): number {
  const parts = dateKeyParts(dateKey)
  return parts ? localDateStartMs(parts) : Number.NaN
}

function endOfLocalDate(dateKey: string): number {
  const parts = dateKeyParts(dateKey)
  return parts ? nextLocalDateStartMs(parts) : Number.NaN
}

export function calendarDateKey(value: Date | string): string {
  if (value instanceof Date) return localDateKeyFromDate(value)

  const text = String(value).trim()
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(text)
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return localDateKeyFromDate(parsed)

  const directMatch = DATE_KEY_PATTERN.exec(text)
  return directMatch ? `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}` : ''
}

export function calendarVisibleRange(
  anchor: Date | string = new Date(),
  options: CalendarVisibleRangeOptions = {}
): CalendarEventRange {
  const anchorKey = calendarDateKey(anchor)
  const parts = dateKeyParts(anchorKey) ?? dateKeyParts(calendarDateKey(new Date()))
  if (!parts) {
    return {
      end: isoFromLocalDate(new Date(1970, 1, 1)),
      start: isoFromLocalDate(new Date(1970, 0, 1))
    }
  }

  const monthsBefore = Math.max(0, Math.floor(options.monthsBefore ?? 0))
  const monthsAfter = Math.max(0, Math.floor(options.monthsAfter ?? 0))
  const [year, month] = parts
  const start = new Date(year, month - 1 - monthsBefore, 1)
  const end = new Date(year, month + monthsAfter, 1)

  return {
    end: isoFromLocalDate(end),
    start: isoFromLocalDate(start)
  }
}

function eventAllDayStartMs(value: string): number {
  const parts = dateKeyParts(value)
  return parts ? localDateStartMs(parts) : Number.NaN
}

function eventAllDayEndMs(event: CalendarEvent): number {
  const start = eventStartMs(event)
  if (Number.isNaN(start)) return Number.NaN

  const end = eventAllDayStartMs(event.endsAt)
  if (!Number.isNaN(end) && end > start) return end

  const startParts = dateKeyParts(event.startsAt)
  return startParts ? nextLocalDateStartMs(startParts) : Number.NaN
}

function eventStartMs(event: CalendarEvent): number {
  return event.allDay ? eventAllDayStartMs(event.startsAt) : Date.parse(event.startsAt)
}

function eventEndMs(event: CalendarEvent): number {
  if (event.allDay) return eventAllDayEndMs(event)

  const parsedEnd = Date.parse(event.endsAt)
  if (!Number.isNaN(parsedEnd) && parsedEnd > eventStartMs(event)) return parsedEnd

  const start = eventStartMs(event)
  if (Number.isNaN(start)) return Number.NaN

  return start + 1
}

export function calendarEventOverlapsDate(event: CalendarEvent, dateKey: string): boolean {
  const dayStart = startOfLocalDate(dateKey)
  const dayEnd = endOfLocalDate(dateKey)
  if (Number.isNaN(dayStart) || Number.isNaN(dayEnd)) return false
  const start = eventStartMs(event)
  const end = eventEndMs(event)

  if (Number.isNaN(start) || Number.isNaN(end)) return false
  return start < dayEnd && end > dayStart
}

export function sortCalendarEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    if (left.allDay !== right.allDay) return left.allDay ? -1 : 1

    const startDelta = eventStartMs(left) - eventStartMs(right)
    if (startDelta !== 0 && !Number.isNaN(startDelta)) return startDelta

    const endDelta = eventEndMs(left) - eventEndMs(right)
    if (endDelta !== 0 && !Number.isNaN(endDelta)) return endDelta

    return left.title.localeCompare(right.title) || left.uid.localeCompare(right.uid)
  })
}

export function calendarEventsForDate(events: readonly CalendarEvent[], dateKey: string): CalendarEvent[] {
  return sortCalendarEvents(events.filter(event => calendarEventOverlapsDate(event, dateKey)))
}

export function calendarEventCountForDate(events: readonly CalendarEvent[], dateKey: string): number {
  return events.filter(event => calendarEventOverlapsDate(event, dateKey)).length
}

export function formatCalendarEventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day'

  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  if (Number.isNaN(start.getTime())) return 'Time unavailable'

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  })

  const startLabel = formatter.format(start)
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return startLabel

  return `${startLabel}–${formatter.format(end)}`
}

export function calendarEventSubtitle(event: CalendarEvent): string {
  return [formatCalendarEventTime(event), clean(event.location), clean(event.calendarName)].filter(Boolean).join(' · ')
}
