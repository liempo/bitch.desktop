import { describe, expect, it } from 'vitest'
import navbarSource from './navigation/AppNavbar.svelte?raw'
import { agentRoute } from './router.svelte'
import { sessionRoute } from './agent/router.svelte'

describe('top-level CMD routing', () => {
  it('builds the CMD tab href for the current stored session when one is selected', () => {
    expect((agentRoute as (sessionId?: null | string) => string)('stored-session')).toBe('/cmd/stored-session')
  })

  it('keeps agent session routes under the CMD route while preserving legacy parsing elsewhere', () => {
    expect(sessionRoute('stored-session')).toBe('/cmd/stored-session')
  })

  it('wires the CMD nav item to the last selected stored session', () => {
    expect(navbarSource).toContain('agentRoute(sessionState.storedSessionId)')
  })
})
