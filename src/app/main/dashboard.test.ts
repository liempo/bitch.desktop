import { describe, expect, it } from 'vitest'

import {
  dashboardConnectionSummary,
  dashboardQuickLinks,
  formatSessionTimestamp,
  recentDashboardSessions
} from './dashboard'
import type { SessionInfo } from '$lib/types/hermes'

function session(partial: Partial<SessionInfo> & Pick<SessionInfo, 'id'>): SessionInfo {
  return {
    ended_at: null,
    input_tokens: 0,
    is_active: false,
    last_active: 0,
    message_count: 0,
    model: null,
    output_tokens: 0,
    preview: null,
    source: null,
    started_at: 0,
    title: null,
    tool_call_count: 0,
    ...partial
  }
}

describe('main dashboard helpers', () => {
  it('exposes implemented navigation including the Cron manager surface', () => {
    const links = dashboardQuickLinks('stored session')

    expect(links.map(link => link.id)).toEqual(['agent', 'assets', 'calendar', 'kanban', 'cron'])
    expect(links.find(link => link.id === 'agent')).toMatchObject({
      href: '#/agent/stored%20session',
      label: 'Agent',
      state: 'ready'
    })
    expect(links.find(link => link.id === 'assets')).toMatchObject({
      href: '#/assets',
      label: 'Assets',
      state: 'ready'
    })
    expect(links.find(link => link.id === 'calendar')).toMatchObject({
      href: '#/calendar',
      label: 'Calendar',
      state: 'ready'
    })
    expect(links.find(link => link.id === 'kanban')).toMatchObject({
      href: '#/kanban',
      label: 'Kanban',
      state: 'ready'
    })
    expect(links.find(link => link.id === 'cron')).toMatchObject({
      href: '#/cron',
      label: 'Cron',
      state: 'ready'
    })
  })

  it('summarizes dashboard gateway health and target with operator-facing labels', () => {
    expect(
      dashboardConnectionSummary({
        activeProfile: 'default',
        detail: 'Dashboard gateway ready for default',
        state: 'open',
        target: 'http://127.0.0.1:9119'
      })
    ).toEqual({
      detail: 'Dashboard gateway ready for default',
      label: 'Online',
      profile: 'default',
      target: 'http://127.0.0.1:9119',
      tone: 'good'
    })

    expect(
      dashboardConnectionSummary({
        activeProfile: 'ops',
        detail: '',
        state: 'idle',
        target: ''
      })
    ).toMatchObject({ detail: 'Awaiting gateway probe', label: 'Idle', target: 'Not resolved yet', tone: 'muted' })
  })

  it('normalizes the recent session list to active conversations with readable timestamps', () => {
    const sessions = recentDashboardSessions(
      [
        session({ id: 'old', is_active: false, last_active: 10, title: 'old conversation' }),
        session({ id: 'active', is_active: true, last_active: 30, title: 'active conversation' }),
        session({ id: 'untitled', is_active: false, last_active: 20, preview: 'preview fallback' }),
        session({ id: 'archived', archived: true, is_active: true, last_active: 40, title: 'archived conversation' })
      ],
      2
    )

    expect(sessions).toEqual([
      expect.objectContaining({ href: '#/agent/active', id: 'active', status: 'active', title: 'active conversation' }),
      expect.objectContaining({ href: '#/agent/untitled', id: 'untitled', status: 'idle', title: 'preview fallback' })
    ])
  })

  it('formats missing and epoch timestamps without leaking raw seconds', () => {
    expect(formatSessionTimestamp(null)).toBe('No activity recorded')
    expect(formatSessionTimestamp(0)).toContain('1970')
  })
})
