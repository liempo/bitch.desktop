import { describe, expect, it } from 'vitest'

import appShellSource from '../AppShell.svelte?raw'
import navbarSource from '../navigation/AppNavbar.svelte?raw'
import calendarPageSource from './CalendarPage.svelte?raw'

describe('Calendar route shell', () => {
  it('adds Calendar to the top-level shell and navigation', () => {
    expect(appShellSource).toContain("import CalendarPage from './calendar/CalendarPage.svelte'")
    expect(appShellSource).toContain("appRouterState.page === 'calendar'")
    expect(appShellSource).toContain('<CalendarPage />')
    expect(navbarSource).toContain("{ href: `#${calendarRoute()}`, label: 'CALENDAR', page: 'calendar' }")
  })

  it('uses Schedule-X Svelte views and the tsdav-backed CalDAV loader instead of a hand-rolled grid', () => {
    expect(calendarPageSource).toContain("import { ScheduleXCalendar } from '@schedule-x/svelte'")
    expect(calendarPageSource).toContain('createViewDay')
    expect(calendarPageSource).toContain('createViewWeek')
    expect(calendarPageSource).toContain('createViewMonthGrid')
    expect(calendarPageSource).toContain('createViewMonthAgenda')
    expect(calendarPageSource).toContain('createViewList')
    expect(calendarPageSource).toContain('fetchCalDavCalendarEvents')
    expect(calendarPageSource).toContain('Read-only')
  })
})
