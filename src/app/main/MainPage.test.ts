import { describe, expect, it } from 'vitest'

import dashboardSource from './dashboard.ts?raw'
import mainPageSource from './MainPage.svelte?raw'
import renderGeoPanelSource from './RenderGeoPanel.svelte?raw'
import renderGeoSceneSource from './RenderGeoScene.svelte?raw'
import hostMonitorSource from '$lib/host-monitor.ts?raw'

describe('Main dashboard source contract', () => {
  it('replaces the placeholder with live connection, profile, session, and host monitor sections', () => {
    expect(mainPageSource).toContain('dashboardConnectionSummary')
    expect(mainPageSource).toContain('recentDashboardSessions')
    expect(mainPageSource).toContain('fetchHostMetrics')
    expect(mainPageSource).toContain('hostMonitorConfig')
    expect(mainPageSource).toContain('gatewayState.connectionTarget')
    expect(mainPageSource).toContain('profileState.activeGatewayProfile')
    expect(mainPageSource).toContain('sessionState.sessions')
    expect(mainPageSource).toContain('HOST_LINK')
    expect(mainPageSource).toContain('CPU_STATS')
    expect(mainPageSource).toContain('MEMORY_STATS')
    expect(mainPageSource).toContain('RAM_USED')
    expect(mainPageSource).not.toContain('Dashboard page placeholder')
  })

  it('uses Threlte for the render_geo panel and reflects CPU/RAM load in geometry', () => {
    expect(mainPageSource).toContain('RenderGeoPanel')
    expect(renderGeoPanelSource).toContain("import { Canvas } from '@threlte/core'")
    expect(renderGeoPanelSource).toContain('// RENDER_GEO')
    expect(renderGeoSceneSource).toContain("import { T, useTask } from '@threlte/core'")
    expect(renderGeoSceneSource).toContain('cpuUsagePercent')
    expect(renderGeoSceneSource).toContain('memoryUsagePercent')
    expect(renderGeoSceneSource).toContain('IcosahedronGeometry')
    expect(renderGeoSceneSource).toContain('LineSegments')
    expect(mainPageSource).not.toContain('Glyph')
  })

  it('loads host monitor endpoint config from HOST_MONITOR_URL and HOST_MONITOR_PORT', () => {
    expect(hostMonitorSource).toContain('__HOST_MONITOR_URL__')
    expect(hostMonitorSource).toContain('__HOST_MONITOR_PORT__')
    expect(hostMonitorSource).toContain('/metrics')
  })

  it('loads remote dashboard state instead of offering local Hermes bootstrap controls', () => {
    expect(mainPageSource).toContain('refreshActiveProfile')
    expect(mainPageSource).toContain('initializeSessions')
    expect(mainPageSource).toContain("connectionState !== 'open'")
    expect(`${mainPageSource}\n${dashboardSource}`).not.toMatch(
      /local Hermes bootstrap|BITCH_GATEWAY_URL|VITE_BOX_BASE_URL|Dufs|bitch\.plugin/i
    )
  })

  it('renders Calendar, Cron, and Kanban as visible placeholder panels without fake routes', () => {
    expect(mainPageSource).toContain('CALENDAR')
    expect(mainPageSource).toContain('CRON')
    expect(mainPageSource).toContain('KANBAN_SUMMARY')
    expect(mainPageSource).toContain('placeholder')
    expect(dashboardSource).toContain("id: 'cron'")
    expect(dashboardSource).toContain("id: 'kanban'")
    expect(dashboardSource).toContain("id: 'calendar'")
    expect(dashboardSource).toContain("state: 'planned'")
  })
})
