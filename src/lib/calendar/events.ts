import ICAL from 'ical.js'
import { Temporal } from 'temporal-polyfill'
import type { CalendarEvent as ScheduleXEvent } from '@schedule-x/calendar'

export interface CalendarResource {
  color?: string
  displayName: string
  id: string
  url: string
}

export interface CalendarObjectResource {
  calendar: CalendarResource
  data?: unknown
  etag?: string
  url: string
}

export interface CalendarQueryRange {
  end: string
  start: string
  timezone?: string
}

interface CalendarAlarm {
  action?: string
  description?: string
  trigger?: string
}

export interface CalendarDisplayEvent {
  alarms: CalendarAlarm[]
  allDay: boolean
  calendarColor: string
  calendarId: string
  calendarName: string
  description?: string
  end: string
  id: string
  location?: string
  recurring: boolean
  start: string
  timezone: string
  title: string
}

const DEFAULT_TIMEZONE = 'UTC'
const MAX_RECURRENCES_PER_EVENT = 500

export function colorForCalendar(calendar: Pick<CalendarResource, 'color' | 'displayName' | 'id' | 'url'>): string {
  const explicit = calendar.color?.trim()
  if (explicit && /^#[0-9a-f]{6}$/i.test(explicit)) return explicit

  const seed = `${calendar.id}:${calendar.displayName}:${calendar.url}`
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return hslToHex(hash % 360, 78, 58)
}

function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lightness - chroma / 2
  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${[r, g, b]
    .map(value =>
      Math.round((value + m) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

export function parseCalendarObjects(
  objects: CalendarObjectResource[],
  range: CalendarQueryRange
): CalendarDisplayEvent[] {
  const parsedEvents: CalendarDisplayEvent[] = []
  const rangeStart = ICAL.Time.fromDateString(range.start.slice(0, 10))
  const rangeEnd = ICAL.Time.fromDateString(range.end.slice(0, 10))

  for (const object of objects) {
    const data = typeof object.data === 'string' ? object.data.trim() : ''
    if (!data) continue

    let vevents: ICAL.Component[]
    try {
      const root = new ICAL.Component(ICAL.parse(data))
      vevents = root.getAllSubcomponents('vevent')
    } catch {
      continue
    }

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent)
      if (event.isRecurrenceException()) continue

      if (event.isRecurring()) {
        parsedEvents.push(...expandRecurringEvent(event, vevent, object.calendar, range, rangeStart, rangeEnd))
      } else if (overlapsRange(event.startDate, event.endDate, rangeStart, rangeEnd)) {
        parsedEvents.push(eventFromTimes(event, vevent, object.calendar, event.startDate, event.endDate, range, false))
      }
    }
  }

  return parsedEvents.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}

function expandRecurringEvent(
  event: ICAL.Event,
  vevent: ICAL.Component,
  calendar: CalendarResource,
  range: CalendarQueryRange,
  rangeStart: ICAL.Time,
  rangeEnd: ICAL.Time
): CalendarDisplayEvent[] {
  const occurrences: CalendarDisplayEvent[] = []
  const iterator = event.iterator()
  let next = iterator.next()
  let guard = 0

  while (next && guard < MAX_RECURRENCES_PER_EVENT) {
    guard += 1
    if (next.compare(rangeEnd) >= 0) break

    const details = event.getOccurrenceDetails(next)
    if (overlapsRange(details.startDate, details.endDate, rangeStart, rangeEnd)) {
      occurrences.push(eventFromTimes(event, vevent, calendar, details.startDate, details.endDate, range, true))
    }

    next = iterator.next()
  }

  return occurrences
}

function overlapsRange(start: ICAL.Time, end: ICAL.Time, rangeStart: ICAL.Time, rangeEnd: ICAL.Time): boolean {
  return start.compare(rangeEnd) < 0 && end.compare(rangeStart) > 0
}

function eventFromTimes(
  event: ICAL.Event,
  vevent: ICAL.Component,
  calendar: CalendarResource,
  start: ICAL.Time,
  end: ICAL.Time,
  range: CalendarQueryRange,
  recurring: boolean
): CalendarDisplayEvent {
  const timezone = timezoneForEvent(vevent, start, range.timezone)
  const normalizedStart = timeToDisplayString(start)
  const normalizedEnd = timeToDisplayString(end)

  return {
    alarms: alarmsForEvent(vevent),
    allDay: start.isDate,
    calendarColor: colorForCalendar(calendar),
    calendarId: calendar.id,
    calendarName: calendar.displayName,
    description: event.description || undefined,
    end: normalizedEnd,
    id: `${calendar.id}:${event.uid || normalizedStart}:${normalizedStart}`,
    location: event.location || undefined,
    recurring,
    start: normalizedStart,
    timezone,
    title: event.summary || '(untitled)'
  }
}

function timeToDisplayString(time: ICAL.Time): string {
  const date = `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  if (time.isDate) return date

  return `${date}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:${String(time.second).padStart(2, '0')}`
}

function timezoneForEvent(vevent: ICAL.Component, start: ICAL.Time, fallback?: string): string {
  const tzid = vevent.getFirstProperty('dtstart')?.getParameter('tzid')
  if (typeof tzid === 'string' && tzid.trim()) return tzid

  const zone = start.zone?.tzid
  if (typeof zone === 'string' && zone.trim() && zone !== 'floating') return zone

  return fallback?.trim() || DEFAULT_TIMEZONE
}

function alarmsForEvent(vevent: ICAL.Component): CalendarAlarm[] {
  return vevent.getAllSubcomponents('valarm').map(alarm => ({
    action: firstPropertyValue(alarm, 'action'),
    description: firstPropertyValue(alarm, 'description'),
    trigger: firstPropertyValue(alarm, 'trigger')
  }))
}

function firstPropertyValue(component: ICAL.Component, propertyName: string): string | undefined {
  const value = component.getFirstPropertyValue(propertyName)
  return value == null ? undefined : String(value)
}

export function toScheduleXEvents(events: CalendarDisplayEvent[]): ScheduleXEvent[] {
  return events.map(event => ({
    calendarId: event.calendarId,
    description: event.description,
    id: event.id,
    location: event.location,
    start: event.allDay
      ? Temporal.PlainDate.from(event.start)
      : Temporal.PlainDateTime.from(event.start).toZonedDateTime(event.timezone),
    end: event.allDay
      ? Temporal.PlainDate.from(event.end)
      : Temporal.PlainDateTime.from(event.end).toZonedDateTime(event.timezone),
    title: event.title,
    _options: { disableDND: true, disableResize: true },
    ...{
      calendarName: event.calendarName,
      recurring: event.recurring,
      alarms: event.alarms
    }
  }))
}
