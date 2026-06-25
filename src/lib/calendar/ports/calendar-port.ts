import type { CalendarConfigStatus, CalendarEvent, CalendarEventRange } from '../domain/events'

export type CalendarConfigStatusLoader = () => Promise<CalendarConfigStatus>
export type CalendarEventsLoader = (range: CalendarEventRange) => Promise<CalendarEvent[]>
