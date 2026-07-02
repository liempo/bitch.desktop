import type { CalendarConfigStatus, CalendarEvent, CalendarEventRange, CalendarSyncStatus } from '../domain/events'

export type CalendarConfigStatusLoader = () => Promise<CalendarConfigStatus>
export type CalendarEventsLoader = (range: CalendarEventRange) => Promise<CalendarEvent[]>
export type CalendarSyncRunner = () => Promise<CalendarSyncStatus>
