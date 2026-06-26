import { messageForError } from '$lib/errors'

import { calendarConfigStatus, syncCalendarEvents } from '../adapters/caldav-calendar-adapter'
import { listCalendarEvents } from '../application/list-calendar-events'
import {
  calendarDateKey,
  calendarEventsForDate,
  calendarVisibleRange,
  type CalendarConfigStatus,
  type CalendarEvent,
  type CalendarEventRange,
  type CalendarSyncStatus
} from '../domain/events'
import type { CalendarConfigStatusLoader, CalendarEventsLoader, CalendarSyncRunner } from '../ports/calendar-port'

export interface CalendarViewModelDependencies {
  loadEvents?: CalendarEventsLoader
  loadStatus?: CalendarConfigStatusLoader
  now?: () => Date
  syncEvents?: CalendarSyncRunner
}

export class CalendarViewModel {
  configStatus = $state<CalendarConfigStatus | null>(null)
  error = $state('')
  events = $state<CalendarEvent[]>([])
  loading = $state(false)
  range = $state<CalendarEventRange>(calendarVisibleRange(new Date()))
  selectedDateKey = $state('')
  visibleAnchorKey = $state('')

  readonly #loadEvents: CalendarEventsLoader
  readonly #loadStatus: CalendarConfigStatusLoader
  readonly #now: () => Date
  readonly #syncEvents: CalendarSyncRunner

  constructor(dependencies: CalendarViewModelDependencies = {}) {
    this.#loadEvents = dependencies.loadEvents ?? listCalendarEvents
    this.#loadStatus = dependencies.loadStatus ?? calendarConfigStatus
    this.#now = dependencies.now ?? (() => new Date())
    this.#syncEvents = dependencies.syncEvents ?? syncCalendarEvents
    this.selectedDateKey = calendarDateKey(this.#now())
    this.visibleAnchorKey = this.selectedDateKey
    this.range = calendarVisibleRange(this.visibleAnchorKey)
  }

  get configured(): boolean {
    return this.configStatus?.configured === true
  }

  get configurationHint(): string {
    return (
      this.configStatus?.hint ??
      'Set CALDAV_URL to a CalDAV endpoint or calendar collection URL, plus CALDAV_USERNAME and CALDAV_PASSWORD.'
    )
  }

  get empty(): boolean {
    return this.events.length === 0
  }

  get selectedEvents(): CalendarEvent[] {
    return calendarEventsForDate(this.events, this.selectedDateKey)
  }

  get statusLabel(): string {
    if (this.loading || this.configStatus?.syncing) return 'syncing'
    if (this.error || this.configStatus?.lastSyncError) return 'error'
    if (!this.configured) return 'config missing'

    return `${this.events.length} ${this.events.length === 1 ? 'event' : 'events'}`
  }

  selectDate(value: Date | string): void {
    const key = calendarDateKey(value)
    if (key) this.selectedDateKey = key
  }

  setVisibleAnchor(value: Date | string): void {
    const key = calendarDateKey(value)
    if (!key) return

    this.visibleAnchorKey = key
    this.range = calendarVisibleRange(key)
  }

  async refresh(): Promise<void> {
    await this.loadVisibleRange()
  }

  async loadVisibleRange(): Promise<void> {
    this.loading = true
    this.error = ''

    try {
      await this.#loadCachedEvents()
    } catch (error) {
      this.error = messageForError(error)
      this.events = []
    } finally {
      this.loading = false
    }
  }

  async syncNow(): Promise<void> {
    this.loading = true
    this.error = ''

    try {
      const status = await this.#loadStatus()
      this.configStatus = status

      if (!status.configured) {
        this.events = []
        return
      }

      this.#applySyncStatus(await this.#syncEvents())
      await this.#loadCachedEvents()
    } catch (error) {
      this.error = messageForError(error)
    } finally {
      this.loading = false
    }
  }

  async #loadCachedEvents(): Promise<void> {
    const status = await this.#loadStatus()
    this.configStatus = status

    if (!status.configured) {
      this.events = []
      return
    }

    this.range = calendarVisibleRange(this.visibleAnchorKey || this.selectedDateKey || this.#now())
    this.events = await this.#loadEvents(this.range)
  }

  #applySyncStatus(status: CalendarSyncStatus): void {
    this.configStatus = {
      ...(this.configStatus ?? { configured: true }),
      cachedSources: status.cachedSources,
      lastSyncError: status.lastError,
      lastSyncedAt: status.lastSyncedAt,
      syncIntervalSeconds: status.syncIntervalSeconds,
      syncing: status.syncing
    }
  }
}

export function createCalendarViewModel(dependencies: CalendarViewModelDependencies = {}): CalendarViewModel {
  return new CalendarViewModel(dependencies)
}
