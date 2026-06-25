import { invokeTauriCommand, listenTauriEvent, type UnlistenFn } from '$lib/platform'

import {
  sortCalendarEvents,
  type CalendarConfigStatus,
  type CalendarEvent,
  type CalendarEventRange,
  type CalendarSyncStatus
} from '../domain/events'

export function calendarConfigStatus(): Promise<CalendarConfigStatus> {
  return invokeTauriCommand<CalendarConfigStatus>('get_caldav_config_status')
}

export async function requestCalendarEvents(range: CalendarEventRange): Promise<CalendarEvent[]> {
  const events = await invokeTauriCommand<CalendarEvent[]>('list_calendar_events', { range })

  return sortCalendarEvents(Array.isArray(events) ? events : [])
}

export function syncCalendarEvents(): Promise<CalendarSyncStatus> {
  return invokeTauriCommand<CalendarSyncStatus>('sync_calendar_events')
}

export function listenCalendarSyncUpdates(handler: (status: CalendarSyncStatus) => void): Promise<UnlistenFn> {
  return listenTauriEvent<CalendarSyncStatus>('calendar-sync-updated', event => handler(event.payload))
}
