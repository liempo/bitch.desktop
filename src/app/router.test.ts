import { describe, expect, it } from 'vitest'
import navbarSource from './navigation/AppNavbar.svelte?raw'
import { agentRoute, calendarRoute } from './router.svelte'
import { sessionRoute } from './agent/router.svelte'

describe('top-level AGENT routing', () => {
  it('builds the AGENT tab href for the current stored session when one is selected', () => {
    expect((agentRoute as (sessionId?: null | string) => string)('stored-session')).toBe('/agent/stored-session')
  })

  it('keeps agent session routes under the AGENT route while preserving legacy parsing elsewhere', () => {
    expect(sessionRoute('stored-session')).toBe('/agent/stored-session')
  })

  it('wires the AGENT nav item to the last selected stored session', () => {
    expect(navbarSource).toContain('agentRoute(sessionState.storedSessionId)')
  })
})

describe('top-level Calendar routing', () => {
  it('builds the Calendar tab href', () => {
    expect(calendarRoute()).toBe('/calendar')
  })
})
