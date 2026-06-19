import { agentRoute, filesRoute } from '../router.svelte'
import type { ConnectionState } from '$lib/stores/gateway.svelte'
import type { SessionInfo } from '$lib/types/hermes'

type DashboardUtilityId = 'calendar' | 'cmd' | 'cron' | 'files' | 'kanban'
export type DashboardUtilityState = 'planned' | 'ready'
export type DashboardConnectionTone = 'bad' | 'busy' | 'good' | 'muted'

export interface DashboardUtilityLink {
  description: string
  href: null | string
  id: DashboardUtilityId
  label: string
  state: DashboardUtilityState
}

export interface DashboardConnectionInput {
  activeProfile: null | string
  detail: null | string
  state: ConnectionState
  target: null | string
}

export interface DashboardConnectionSummary {
  detail: string
  label: string
  profile: string
  target: string
  tone: DashboardConnectionTone
}

export interface DashboardRecentSession {
  href: string
  id: string
  lastActiveLabel: string
  profile: string
  status: 'active' | 'idle'
  title: string
}

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  closed: 'Closed',
  connecting: 'Connecting',
  error: 'Error',
  idle: 'Idle',
  open: 'Online'
}

const CONNECTION_TONES: Record<ConnectionState, DashboardConnectionTone> = {
  closed: 'muted',
  connecting: 'busy',
  error: 'bad',
  idle: 'muted',
  open: 'good'
}

const PLANNED_SURFACES: DashboardUtilityLink[] = [
  {
    description: 'Scheduled job manager is still a roadmap surface; use the dashboard or CLI until it lands here.',
    href: null,
    id: 'cron',
    label: 'Cron',
    state: 'planned'
  },
  {
    description: 'Kanban board controls are planned for this desktop shell; no local board bootstrap is exposed.',
    href: null,
    id: 'kanban',
    label: 'Kanban',
    state: 'planned'
  },
  {
    description: 'Calendar/Chronos controls are planned; this card advertises the future route without faking one.',
    href: null,
    id: 'calendar',
    label: 'Calendar',
    state: 'planned'
  }
]

function clean(value: null | string | undefined): string {
  return value?.trim() ?? ''
}

export function dashboardQuickLinks(currentSessionId?: null | string): DashboardUtilityLink[] {
  return [
    {
      description: 'Open the command thread workspace for the selected or next Hermes session.',
      href: `#${agentRoute(currentSessionId)}`,
      id: 'cmd',
      label: 'CMD',
      state: 'ready'
    },
    {
      description: 'Browse the authenticated remote Hermes filesystem from the app shell.',
      href: `#${filesRoute()}`,
      id: 'files',
      label: 'Files',
      state: 'ready'
    },
    ...PLANNED_SURFACES
  ]
}

export function dashboardConnectionSummary(input: DashboardConnectionInput): DashboardConnectionSummary {
  return {
    detail: clean(input.detail) || 'Awaiting gateway probe',
    label: CONNECTION_LABELS[input.state],
    profile: clean(input.activeProfile) || 'default',
    target: clean(input.target) || 'Not resolved yet',
    tone: CONNECTION_TONES[input.state]
  }
}

export function formatSessionTimestamp(timestamp: null | number | undefined): string {
  if (timestamp == null) return 'No activity recorded'

  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(milliseconds))
}

function sessionTitle(session: SessionInfo): string {
  return clean(session.title) || clean(session.preview) || 'Untitled session'
}

export function recentDashboardSessions(sessions: SessionInfo[], limit = 5): DashboardRecentSession[] {
  return [...sessions]
    .filter(session => !session.archived)
    .sort((left, right) => {
      if (left.is_active !== right.is_active) return left.is_active ? -1 : 1
      return right.last_active - left.last_active
    })
    .slice(0, limit)
    .map(session => ({
      href: `#${agentRoute(session.id)}`,
      id: session.id,
      lastActiveLabel: formatSessionTimestamp(session.last_active),
      profile: clean(session.profile) || (session.is_default_profile ? 'default' : 'unknown'),
      status: session.is_active ? 'active' : 'idle',
      title: sessionTitle(session)
    }))
}
