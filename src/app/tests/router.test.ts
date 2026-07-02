import { describe, expect, it } from 'vitest'
import navbarSource from '../navigation/AppNavbar.svelte?raw'
import {
  agentRoute,
  cronRoute,
  kanbanRoute,
  notificationRouteHash,
  parseAppHash,
  settingsRoute
} from '../router.svelte'
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
    expect(parseAppHash('/cron/nightly-backup')).toEqual({ page: 'cron' })
    expect(parseAppHash('/kanban')).toEqual({ page: 'kanban' })
    expect(parseAppHash('/kanban/t_bitch_notifications_settings')).toEqual({ page: 'kanban' })
    expect(parseAppHash('/settings')).toEqual({ page: 'settings' })
  })

  it('builds the Settings route for the app configuration page', () => {
    expect((settingsRoute as () => string)()).toBe('/settings')
  })

  it('builds route-aware hashes for notification click targets', () => {
    expect(
      (cronRoute as (target?: { jobId?: null | string; profile?: null | string }) => string)({
        jobId: 'nightly backup',
        profile: 'default'
      })
    ).toBe('/cron/nightly%20backup?profile=default')
    expect(
      (
        kanbanRoute as (target?: {
          board?: null | string
          profile?: null | string
          taskId?: null | string
          tenant?: null | string
        }) => string
      )({
        board: 'homelab',
        profile: 'default',
        taskId: 't_bitch_notifications_settings',
        tenant: 'bitch'
      })
    ).toBe('/kanban/t_bitch_notifications_settings?board=homelab&profile=default&tenant=bitch')
    expect(notificationRouteHash({ page: 'agent', sessionId: 'stored-session' })).toBe('/agent/stored-session')
    expect(notificationRouteHash({ page: 'cron', jobId: 'nightly backup', profile: 'default' })).toBe(
      '/cron/nightly%20backup?profile=default'
    )
    expect(notificationRouteHash({ board: 'homelab', page: 'kanban', taskId: 't_1' })).toBe('/kanban/t_1?board=homelab')
    expect(notificationRouteHash(null)).toBe('/agent')
  })

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
