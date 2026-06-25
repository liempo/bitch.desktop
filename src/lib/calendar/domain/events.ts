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

export interface CalendarConfigStatus {
  calendarUrl?: string
  configured: boolean
  hint?: string
  username?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

function clean(value: null | string | undefined): string {
  return value?.trim() ?? ''
}

function dateKeyParts(value: string): [number, number, number] | null {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return null

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isoFromUtcDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

function startOfUtcDate(dateKey: string): number {
  const parts = dateKeyParts(dateKey)
  if (!parts) return Number.NaN
  const [year, month, day] = parts

  return Date.UTC(year, month - 1, day)
}

export function calendarDateKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  const text = String(value).trim()
  const directMatch = DATE_KEY_PATTERN.exec(text)
  if (directMatch) return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

export function calendarVisibleRange(anchor: Date | string = new Date()): CalendarEventRange {
  const anchorKey = calendarDateKey(anchor)
  const parts = dateKeyParts(anchorKey) ?? dateKeyParts(calendarDateKey(new Date()))
  if (!parts) {
    return {
      end: isoFromUtcDate(new Date(Date.UTC(1970, 1, 1))),
      start: isoFromUtcDate(new Date(Date.UTC(1970, 0, 1)))
    }
  }

  const [year, month] = parts
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))

  return {
    end: isoFromUtcDate(end),
    start: isoFromUtcDate(start)
  }
}

function eventStartMs(event: CalendarEvent): number {
  return Date.parse(event.startsAt)
}

function eventEndMs(event: CalendarEvent): number {
  const parsedEnd = Date.parse(event.endsAt)
  if (!Number.isNaN(parsedEnd) && parsedEnd > eventStartMs(event)) return parsedEnd

  const start = eventStartMs(event)
  if (Number.isNaN(start)) return Number.NaN

  return start + (event.allDay ? DAY_MS : 1)
}

export function calendarEventOverlapsDate(event: CalendarEvent, dateKey: string): boolean {
  const dayStart = startOfUtcDate(dateKey)
  if (Number.isNaN(dayStart)) return false

  const dayEnd = dayStart + DAY_MS
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
