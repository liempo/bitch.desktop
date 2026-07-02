import { describe, expect, it } from 'vitest'
import { agentRoute, parseAppHash, settingsRoute } from '../router.svelte'
import { sessionRoute } from '../agent/router.svelte'

describe('top-level app routing', () => {
  it('defaults startup and unknown hashes to the main dashboard', () => {
    expect(parseAppHash('')).toEqual({ page: 'main' })
    expect(parseAppHash('/')).toEqual({ page: 'main' })
    expect(parseAppHash('/unknown')).toEqual({ page: 'main' })
  })

  it('keeps AGENT routes explicit when main is the default page', () => {
    expect(parseAppHash('/agent')).toEqual({ page: 'agent' })
    expect(parseAppHash('/agent/stored-session')).toEqual({ page: 'agent' })
    expect(parseAppHash('/cmd')).toEqual({ page: 'agent' })
    expect(parseAppHash('/cmd/legacy-session')).toEqual({ page: 'agent' })
  })

  it('keeps the other top-level pages addressable', () => {
    expect(parseAppHash('/assets')).toEqual({ page: 'assets' })
    expect(parseAppHash('/files')).toEqual({ page: 'assets' })
    expect(parseAppHash('/calendar')).toEqual({ page: 'calendar' })
    expect(parseAppHash('/cron')).toEqual({ page: 'cron' })
    expect(parseAppHash('/kanban')).toEqual({ page: 'kanban' })
    expect(parseAppHash('/settings')).toEqual({ page: 'settings' })
  })

  it('builds the Settings route for the app configuration page', () => {
    expect((settingsRoute as () => string)()).toBe('/settings')
  })

  it('builds the AGENT tab href for the current stored session when one is selected', () => {
    expect((agentRoute as (sessionId?: null | string) => string)('stored-session')).toBe('/agent/stored-session')
  })

  it('keeps agent session routes under the AGENT route while preserving legacy parsing elsewhere', () => {
    expect(sessionRoute('stored-session')).toBe('/agent/stored-session')
  })
})
