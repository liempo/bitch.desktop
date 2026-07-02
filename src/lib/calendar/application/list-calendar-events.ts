import { requestCalendarEvents } from '../adapters/caldav-calendar-adapter'
import { sortCalendarEvents, type CalendarEvent, type CalendarEventRange } from '../domain/events'
import type { CalendarEventsLoader } from '../ports/calendar-port'

export async function listCalendarEvents(
  range: CalendarEventRange,
  loadEvents: CalendarEventsLoader = requestCalendarEvents
): Promise<CalendarEvent[]> {
  return sortCalendarEvents(await loadEvents(range))
}
