import { describe, expect, it } from 'vitest'

import dashboardSource from './dashboard.ts?raw'
import mainPageSource from './MainPage.svelte?raw'

describe('Main dashboard source contract', () => {
  it('replaces the placeholder with live connection, profile, session, and utility sections', () => {
    expect(mainPageSource).toContain('dashboardConnectionSummary')
    expect(mainPageSource).toContain('dashboardQuickLinks')
    expect(mainPageSource).toContain('recentDashboardSessions')
    expect(mainPageSource).toContain('gatewayState.connectionTarget')
    expect(mainPageSource).toContain('profileState.activeGatewayProfile')
    expect(mainPageSource).toContain('sessionState.sessions')
    expect(mainPageSource).toContain('CONNECTION_TARGET')
    expect(mainPageSource).toContain('ACTIVE_PROFILE')
    expect(mainPageSource).toContain('TASKS')
    expect(mainPageSource).toContain('UTILITY_SURFACES')
    expect(mainPageSource).not.toContain('Dashboard page placeholder')
  })

  it('uses the shared Panel primitive for the Cyberpunk SysMon layout', () => {
    expect(mainPageSource).toContain("import Panel from '@/components/ui/Panel.svelte'")
    expect(mainPageSource).toContain('HARDWARE_GEO')
    expect(mainPageSource).toContain('RADAR_SCAN')
    expect(mainPageSource).toContain('PROCESSING')
    expect(mainPageSource).toContain('SIGNAL_WAVEFORM')
    expect(mainPageSource).toContain('PERFORMANCE')
    expect(mainPageSource).toContain('PWR_CELL')
    expect(mainPageSource).toContain('KERNEL_LOG')
    expect(mainPageSource).toContain('BITCH_OS')
    expect(mainPageSource).not.toContain('Glyph')
  })

  it('loads remote dashboard state instead of offering local Hermes bootstrap controls', () => {
    expect(mainPageSource).toContain('refreshActiveProfile')
    expect(mainPageSource).toContain('initializeSessions')
    expect(mainPageSource).toContain("connectionState !== 'open'")
    expect(`${mainPageSource}
${dashboardSource}`).not.toMatch(/local Hermes bootstrap|BITCH_GATEWAY_URL|VITE_BOX_BASE_URL|Dufs|bitch\.plugin/i)
  })

  it('renders planned Cron, Kanban, and Calendar surfaces as disabled roadmap cards', () => {
    expect(dashboardSource).toContain("id: 'cron'")
    expect(dashboardSource).toContain("id: 'kanban'")
    expect(dashboardSource).toContain("id: 'calendar'")
    expect(dashboardSource).toContain("state: 'planned'")
    expect(mainPageSource).toContain('aria-disabled="true"')
  })
})
