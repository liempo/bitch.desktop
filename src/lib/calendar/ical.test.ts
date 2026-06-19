import { describe, expect, it } from 'vitest'

import { colorForCalendar, parseCalendarObjects, toScheduleXEvents, type CalendarResource } from './events'

const workCalendar: CalendarResource = {
  color: '#ff0055',
  displayName: 'Work',
  id: 'work',
  url: 'http://127.0.0.1:5232/liempo/work/'
}

const personalCalendar: CalendarResource = {
  color: '#00ffaa',
  displayName: 'Personal',
  id: 'personal',
  url: 'http://127.0.0.1:5232/liempo/personal/'
}

describe('iCalendar event mapping', () => {
  it('maps timed events with timezone, calendar color, location, and alarms', () => {
    const [event] = parseCalendarObjects(
      [
        {
          calendar: workCalendar,
          data: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:standup-1\nSUMMARY:Ops standup\nLOCATION:HQ-3\nDTSTART;TZID=America/New_York:20260622T090000\nDTEND;TZID=America/New_York:20260622T093000\nBEGIN:VALARM\nTRIGGER:-PT10M\nACTION:DISPLAY\nDESCRIPTION:ping\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR`,
          etag: 'abc',
          url: 'standup.ics'
        }
      ],
      { end: '2026-06-30', start: '2026-06-01', timezone: 'America/New_York' }
    )

    expect(event).toMatchObject({
      allDay: false,
      calendarColor: '#ff0055',
      calendarId: 'work',
      calendarName: 'Work',
      id: 'work:standup-1:2026-06-22T09:00:00',
      location: 'HQ-3',
      title: 'Ops standup',
      timezone: 'America/New_York'
    })
    expect(event.start).toBe('2026-06-22T09:00:00')
    expect(event.end).toBe('2026-06-22T09:30:00')
    expect(event.alarms).toHaveLength(1)
  })

  it('maps all-day events and expands recurring events inside the requested range', () => {
    const events = parseCalendarObjects(
      [
        {
          calendar: personalCalendar,
          data: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:travel\nSUMMARY:Travel day\nDTSTART;VALUE=DATE:20260620\nDTEND;VALUE=DATE:20260621\nEND:VEVENT\nEND:VCALENDAR`,
          url: 'travel.ics'
        },
        {
          calendar: workCalendar,
          data: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:weekly-sync\nSUMMARY:Weekly sync\nDTSTART;TZID=America/New_York:20260615T110000\nDTEND;TZID=America/New_York:20260615T120000\nRRULE:FREQ=WEEKLY;COUNT=3\nEND:VEVENT\nEND:VCALENDAR`,
          url: 'sync.ics'
        }
      ],
      { end: '2026-06-30', start: '2026-06-18', timezone: 'America/New_York' }
    )

    expect(events.map(event => event.title)).toEqual(['Travel day', 'Weekly sync', 'Weekly sync'])
    expect(events[0]).toMatchObject({ allDay: true, end: '2026-06-21', start: '2026-06-20' })
    expect(events.slice(1).map(event => event.start)).toEqual(['2026-06-22T11:00:00', '2026-06-29T11:00:00'])
    expect(events.slice(1).every(event => event.recurring)).toBe(true)
  })

  it('skips malformed iCalendar payloads without dropping valid objects in the same load', () => {
    const events = parseCalendarObjects(
      [
        {
          calendar: workCalendar,
          data: 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nBROKEN',
          url: 'broken.ics'
        },
        {
          calendar: personalCalendar,
          data: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:valid\nSUMMARY:Valid hold\nDTSTART;VALUE=DATE:20260620\nDTEND;VALUE=DATE:20260621\nEND:VEVENT\nEND:VCALENDAR`,
          url: 'valid.ics'
        }
      ],
      { end: '2026-06-30', start: '2026-06-01', timezone: 'UTC' }
    )

    expect(events.map(event => event.title)).toEqual(['Valid hold'])
  })

  it('builds deterministic colors for calendars that do not expose one and converts events for Schedule-X', () => {
    expect(colorForCalendar({ ...workCalendar, color: undefined })).toMatch(/^#[0-9a-f]{6}$/)

    const [event] = toScheduleXEvents([
      {
        alarms: [],
        allDay: true,
        calendarColor: '#00ffaa',
        calendarId: 'personal',
        calendarName: 'Personal',
        end: '2026-06-21',
        id: 'travel',
        recurring: false,
        start: '2026-06-20',
        timezone: 'UTC',
        title: 'Travel day'
      }
    ])

    expect(event).toMatchObject({ calendarId: 'personal', id: 'travel', title: 'Travel day' })
    expect(String(event.start)).toBe('2026-06-20')
    expect(String(event.end)).toBe('2026-06-21')
  })
})
