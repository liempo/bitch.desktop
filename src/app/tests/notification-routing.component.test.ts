// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockConnectGateway,
  mockDisconnectGateway,
  mockInstallNotificationClickHandler,
  mockRefreshActiveProfile,
  mockStartMessageStream,
  mockStopMessageStream
} = vi.hoisted(() => ({
  mockConnectGateway: vi.fn(async () => undefined),
  mockDisconnectGateway: vi.fn(),
  mockInstallNotificationClickHandler: vi.fn(async (handler: (target: unknown) => void) => {
    void handler
    return vi.fn()
  }),
  mockRefreshActiveProfile: vi.fn(async () => undefined),
  mockStartMessageStream: vi.fn(),
  mockStopMessageStream: vi.fn()
}))

vi.mock('$lib/platform', () => ({
  installMacosNotificationClickHandler: mockInstallNotificationClickHandler,
  openExternalUrl: vi.fn(async () => undefined)
}))

vi.mock('$lib/layout', () => ({
  installCustomScrollbars: vi.fn(() => vi.fn()),
  SPLASH_MIN_DURATION_MS: 0,
  SPLASH_REMOVE_AFTER_MS: 0,
  STARTUP_SPLASH_COMPLETE_EVENT: 'bitch-startup-splash-complete'
}))

vi.mock('../../app/AppShell.svelte', () => ({
  default: () => undefined
}))

vi.mock('$lib/hermes/gateway', () => ({
  connectGateway: mockConnectGateway,
  disconnectGateway: mockDisconnectGateway
}))

vi.mock('$lib/hermes/conversations', () => ({
  startMessageStream: mockStartMessageStream,
  stopMessageStream: mockStopMessageStream
}))

vi.mock('$lib/hermes/profiles', () => ({
  refreshActiveProfile: mockRefreshActiveProfile
}))

import App from '../../App.svelte'

describe('notification click route handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = ''
  })

  it('routes mocked Tauri notification click targets to the safest matching app page', async () => {
    render(App)

    await waitFor(() => expect(mockInstallNotificationClickHandler).toHaveBeenCalledOnce())

    const handleClickTarget = mockInstallNotificationClickHandler.mock.calls[0]?.[0]

    handleClickTarget({ jobId: 'nightly backup', page: 'cron', profile: 'default' })
    expect(window.location.hash).toBe('#/cron/nightly%20backup?profile=default')

    handleClickTarget({ board: 'homelab', page: 'kanban', taskId: 't_bitch_notifications_settings', tenant: 'bitch' })
    expect(window.location.hash).toBe('#/kanban/t_bitch_notifications_settings?board=homelab&tenant=bitch')

    handleClickTarget({ page: 'agent', sessionId: 'stored-session' })
    expect(window.location.hash).toBe('#/agent/stored-session')
  })
})
