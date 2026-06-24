import { describe, expect, it } from 'vitest'

import appShellSource from '../../AppShell.svelte?raw'
import dashboardSource from '../../main/dashboard.ts?raw'
import navSource from '../../navigation/AppNavbar.svelte?raw'
import routerSource from '../../router.svelte.ts?raw'
import { cronRoute } from '../../router.svelte'
import cronPageSource from '../../cron/CronPage.svelte?raw'
import cronJobDialogSource from '../../cron/CronJobDialog.svelte?raw'
import cronJobManagerPanelSource from '../../cron/CronJobManagerPanel.svelte?raw'

const cronFeatureSource = [cronPageSource, cronJobManagerPanelSource, cronJobDialogSource].join('\n')

describe('cron manager page contract', () => {
  it('adds Cron as a top-level desktop route and nav item', () => {
    expect((cronRoute as () => string)()).toBe('/cron')
    expect(routerSource).toContain("'cron'")
    expect(routerSource).toContain('cronRoute')
    expect(navSource).toContain("label: 'CRON'")
    expect(navSource).toContain('cronRoute()')
    expect(appShellSource).toContain("cron: () => import('./cron/CronPage.svelte')")
    expect(appShellSource).toContain('loadPageComponent(appRouterState.page)')
    expect(appShellSource).toContain('<PageComponent />')
    expect(dashboardSource).toContain("id: 'cron'")
    expect(dashboardSource).toContain('href: `#${cronRoute()}`')
  })

  it('lists jobs with operational fields and row actions', () => {
    expect(cronFeatureSource).toContain('CronJobManagerPanel')
    expect(cronFeatureSource).toContain('getCronJobs')
    expect(cronFeatureSource).toContain('pauseCronJob')
    expect(cronFeatureSource).toContain('resumeCronJob')
    expect(cronFeatureSource).toContain('runCronJob')
    expect(cronFeatureSource).toContain('deleteCronJob')
    expect(cronFeatureSource).toContain('cronJobProfile')
    expect(cronFeatureSource).toContain('cronJobScheduleLabel')
    expect(cronFeatureSource).toContain('next_run_at')
    expect(cronFeatureSource).toContain('jobSummary')
  })

  it('uses the Composer-style profile picker in the job list header', () => {
    expect(cronJobManagerPanelSource).toContain("import { Popover } from 'bits-ui'")
    expect(cronJobManagerPanelSource).toContain('profile:{profileLabel}')
    expect(cronJobManagerPanelSource).toContain('profileChoicesFor')
    expect(cronJobManagerPanelSource).toContain('sortByProfileOrder')
    expect(cronJobManagerPanelSource).not.toContain('<select')
  })

  it('surfaces recent run output and failure state outside the chat conversation', () => {
    expect(cronFeatureSource).toContain('getCronJobRuns')
    expect(cronFeatureSource).toContain('Recent run output')
    expect(cronFeatureSource).toContain('last_error')
    expect(cronFeatureSource).toContain('last_delivery_error')
    expect(cronFeatureSource).toContain('runPreview')
    expect(cronFeatureSource).toContain('agentRoute(run.id)')
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
      expect(cronFeatureSource).toContain(label)
    }
    expect(cronFeatureSource).toContain('CronJobDialog')
    expect(cronFeatureSource).toContain('getCronDeliveryTargets')
    expect(cronFeatureSource).toContain('createCronJob')
    expect(cronFeatureSource).toContain('updateCronJob')
  })

  it('stays remote-only through the Tauri dashboard bridge', () => {
    expect(cronFeatureSource).toContain('$lib/hermes/cron')
    expect(cronFeatureSource).not.toContain('hermes cron')
    expect(cronFeatureSource).not.toContain('child_process')
    expect(cronFeatureSource).not.toContain('bitch.plugin')
    expect(cronFeatureSource).not.toContain('VITE_BOX_BASE_URL')
  })
})
