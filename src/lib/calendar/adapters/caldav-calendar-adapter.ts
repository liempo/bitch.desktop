import { invokeTauriCommand } from '$lib/platform'

import {
  sortCalendarEvents,
  type CalendarConfigStatus,
  type CalendarEvent,
  type CalendarEventRange
} from '../domain/events'

export function calendarConfigStatus(): Promise<CalendarConfigStatus> {
  return invokeTauriCommand<CalendarConfigStatus>('get_caldav_config_status')
}

export async function requestCalendarEvents(range: CalendarEventRange): Promise<CalendarEvent[]> {
  const events = await invokeTauriCommand<CalendarEvent[]>('list_calendar_events', { range })

  return sortCalendarEvents(Array.isArray(events) ? events : [])
}
