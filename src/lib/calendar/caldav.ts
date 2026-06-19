import { invoke } from '@tauri-apps/api/core'
import { createDAVClient, type DAVCalendar, type DAVObject } from 'tsdav'

import {
  colorForCalendar,
  parseCalendarObjects,
  type CalendarDisplayEvent,
  type CalendarObjectResource,
  type CalendarQueryRange,
  type CalendarResource
} from './events'

export interface ResolvedCalendarConnection {
  authMode: 'basic'
  baseUrl: string
  configured: boolean
  passwordPresent: boolean
  profile?: null | string
  timezone: string
  usernamePresent: boolean
}

interface CalendarBridgeResponse {
  body: string
  headers: Record<string, string>
  status: number
  statusText: string
  url: string
}

export interface FetchCalDavEventsOptions extends CalendarQueryRange {
  profile?: null | string
}

export interface FetchCalDavEventsResult {
  calendars: CalendarResource[]
  connection: ResolvedCalendarConnection
  events: CalendarDisplayEvent[]
}

export async function resolveCalendarConnection(profile?: null | string): Promise<ResolvedCalendarConnection> {
  return invokeCalendarBridge<ResolvedCalendarConnection>('resolve_calendar_connection', { profile: profile ?? null })
}

export function createTauriCalDavFetch(profile?: null | string): typeof fetch {
  return async (input, init = {}) => {
    const response = await invokeCalendarBridge<CalendarBridgeResponse>('calendar_request', {
      profile: profile ?? null,
      request: {
        body: await bodyToText(init.body),
        headers: headersToRecord(init.headers),
        method: init.method ?? 'GET',
        url: requestUrl(input)
      }
    })

    return new Response(response.body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText
    })
  }
}

export async function fetchCalDavCalendarEvents(options: FetchCalDavEventsOptions): Promise<FetchCalDavEventsResult> {
  const connection = await resolveCalendarConnection(options.profile)
  if (!connection.configured) {
    throw new Error('Calendar CalDAV connection is not configured in BITCH connection settings.')
  }

  const bridgeFetch = createTauriCalDavFetch(options.profile)
  const client = await createDAVClient({
    authFunction: async () => ({}),
    authMethod: 'Custom',
    credentials: {},
    defaultAccountType: 'caldav',
    fetch: bridgeFetch,
    serverUrl: connection.baseUrl
  })

  const davCalendars = await client.fetchCalendars()
  const calendars = davCalendars.map(calendarResourceFromDav)
  const objectBatches = await Promise.all(
    davCalendars.map(async (calendar, index) => {
      const resource = calendars[index]
      const objects = await client.fetchCalendarObjects({
        calendar,
        expand: false,
        fetch: bridgeFetch,
        timeRange: { end: options.end, start: options.start }
      })

      return objects.map(object => calendarObjectFromDav(object, resource))
    })
  )

  const events = parseCalendarObjects(objectBatches.flat(), {
    end: options.end,
    start: options.start,
    timezone: options.timezone || connection.timezone
  })

  return { calendars, connection, events }
}

async function invokeCalendarBridge<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    if (isMissingTauriBridgeError(error)) {
      throw new Error('Calendar CalDAV bridge is unavailable outside the BITCH desktop shell.')
    }

    throw error
  }
}

function isMissingTauriBridgeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("reading 'invoke'") ||
    message.includes('transformCallback') ||
    message.includes('__TAURI_INTERNALS__')
  )
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

async function bodyToText(body: BodyInit | null | undefined): Promise<null | string> {
  if (body == null) return null
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof Blob) return await body.text()
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body)
  return String(body)
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const normalized = new Headers(headers)
  return Object.fromEntries([...normalized.entries()].map(([key, value]) => [key.toLowerCase(), value]))
}

function calendarResourceFromDav(calendar: DAVCalendar, index: number): CalendarResource {
  const displayName =
    typeof calendar.displayName === 'string' && calendar.displayName.trim()
      ? calendar.displayName
      : `Calendar ${index + 1}`
  const id = stableCalendarId(calendar.url, index)

  return {
    color: normalizeColor(calendar.calendarColor),
    displayName,
    id,
    url: calendar.url
  }
}

function calendarObjectFromDav(object: DAVObject, calendar: CalendarResource): CalendarObjectResource {
  return {
    calendar: {
      ...calendar,
      color: calendar.color || colorForCalendar(calendar)
    },
    data: object.data,
    etag: object.etag,
    url: object.url
  }
}

function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed
  if (/^#[0-9a-f]{8}$/i.test(trimmed)) return trimmed.slice(0, 7)
  return undefined
}

function stableCalendarId(url: string, index: number): string {
  const name = url
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const suffix = calendarUrlHash(url)

  return name ? `${name}-${suffix}` : `calendar-${index + 1}-${suffix}`
}

function calendarUrlHash(url: string): string {
  let hash = 0
  for (const char of url) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  }

  return hash.toString(36)
}
