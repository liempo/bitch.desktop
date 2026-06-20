import { describe, expect, it } from 'vitest'

import appShellSource from '../AppShell.svelte?raw'
import dashboardSource from '../main/dashboard.ts?raw'
import navSource from '../navigation/AppNavbar.svelte?raw'
import routerSource from '../router.svelte.ts?raw'
import { cronRoute } from '../router.svelte'
import cronPageSource from './CronPage.svelte?raw'

describe('cron manager page contract', () => {
  it('adds Cron as a top-level desktop route and nav item', () => {
    expect((cronRoute as () => string)()).toBe('/cron')
    expect(routerSource).toContain("'cron'")
    expect(routerSource).toContain('cronRoute')
    expect(navSource).toContain("label: 'CRON'")
    expect(navSource).toContain('cronRoute()')
    expect(appShellSource).toContain("import CronPage from './cron/CronPage.svelte'")
    expect(appShellSource).toContain("appRouterState.page === 'cron'")
    expect(appShellSource).toContain('<CronPage />')
    expect(dashboardSource).toContain("id: 'cron'")
    expect(dashboardSource).toContain('href: `#${cronRoute()}`')
  })

  it('lists jobs with operational fields and row actions', () => {
    expect(cronPageSource).toContain('getCronJobs')
    expect(cronPageSource).toContain('pauseCronJob')
    expect(cronPageSource).toContain('resumeCronJob')
    expect(cronPageSource).toContain('runCronJob')
    expect(cronPageSource).toContain('deleteCronJob')
    expect(cronPageSource).toContain('Last run')
    expect(cronPageSource).toContain('Next run')
    expect(cronPageSource).toContain('Delivery')
    expect(cronPageSource).toContain('Profile')
  })

  it('surfaces recent run output and failure state outside the chat thread', () => {
    expect(cronPageSource).toContain('getCronJobRuns')
    expect(cronPageSource).toContain('Recent run output')
    expect(cronPageSource).toContain('last_error')
    expect(cronPageSource).toContain('last_delivery_error')
    expect(cronPageSource).toContain('runPreview')
    expect(cronPageSource).toContain('agentRoute(run.id)')
  })

  it('exposes the complete create/edit field set from the roadmap', () => {
    for (const label of [
      'Schedule',
      'Prompt',
      'Skills',
      'Model',
      'Provider',
      'Toolsets',
      'Delivery',
      'Script',
      'No-agent mode',
      'Context jobs',
      'Workdir',
      'Profile'
    ]) {
      expect(cronPageSource).toContain(label)
    }
    expect(cronPageSource).toContain('getCronDeliveryTargets')
    expect(cronPageSource).toContain('createCronJob')
    expect(cronPageSource).toContain('updateCronJob')
  })

  it('stays remote-only through the Tauri dashboard bridge', () => {
    expect(cronPageSource).toContain('authenticated dashboard cron endpoints')
    expect(cronPageSource).not.toContain('hermes cron')
    expect(cronPageSource).not.toContain('child_process')
    expect(cronPageSource).not.toContain('bitch.plugin')
    expect(cronPageSource).not.toContain('VITE_BOX_BASE_URL')
  })
})
