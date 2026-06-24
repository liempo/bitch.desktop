import { describe, expect, it } from 'vitest'

import appShellSource from '../../AppShell.svelte?raw'
import dashboardSource from '../../main/dashboard.ts?raw'
import navSource from '../../navigation/AppNavbar.svelte?raw'
import routerSource from '../../router.svelte.ts?raw'
import { cronRoute } from '../../router.svelte'
import cronPageSource from '../../cron/CronPage.svelte?raw'
import cronJobDetailsPanelSource from '../../cron/CronJobDetailsPanel.svelte?raw'
import cronJobDialogSource from '../../cron/CronJobDialog.svelte?raw'
import cronJobsPanelSource from '../../cron/CronJobsPanel.svelte?raw'

const cronFeatureSource = [cronPageSource, cronJobsPanelSource, cronJobDialogSource, cronJobDetailsPanelSource].join(
  '\n'
)

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
    expect(cronFeatureSource).toContain('CronJobsPanel')
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
    expect(cronJobsPanelSource).toContain("import { Popover } from 'bits-ui'")
    expect(cronJobsPanelSource).toContain('profile:{profileLabel}')
    expect(cronJobsPanelSource).toContain('profileChoicesFor')
    expect(cronJobsPanelSource).toContain('sortByProfileOrder')
    expect(cronJobsPanelSource).not.toContain('<select')
  })

  it('opens job details as a desktop panel and mobile dialog when a job is selected', () => {
    expect(cronJobsPanelSource).toContain('openJobDetails')
    expect(cronJobsPanelSource).toContain("window.matchMedia('(min-width: 768px)')")
    expect(cronJobsPanelSource).toContain('md:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]')
    expect(cronJobsPanelSource).toContain('aria-label="Cron job details panel"')
    expect(cronJobsPanelSource).toContain('aria-label="Close job details"')
    expect(cronJobsPanelSource).toContain('contentClass="min-h-0 overflow-hidden p-3"')
    expect(cronJobsPanelSource).toContain('bind:open={detailDialogOpen}')
    expect(cronJobsPanelSource).toContain(
      'if (selectedJob && !detailDialogOpen && !isDesktopViewport()) selectedJobKey = null'
    )
    expect(cronJobsPanelSource).toContain('title={cronJobTitle(selectedJob)}')
    expect(cronJobsPanelSource).toContain('description={selectedJob.id}')
    expect(cronJobsPanelSource).toContain(
      'contentClass="flex max-h-[min(38rem,calc(100vh-7rem))] flex-col overflow-hidden"'
    )
    expect(cronJobsPanelSource).toContain('showActions={false}')
    expect(cronJobsPanelSource).toContain('showIdentity={false}')
    expect(cronJobsPanelSource).toContain('aria-label="Job detail actions"')
    expect(cronJobsPanelSource).toContain('class="w-[min(38rem,calc(100vw-2rem))] md:hidden"')
    expect(cronJobsPanelSource).toContain('class="min-h-0 flex-1 overflow-hidden p-3"')
    expect(cronFeatureSource).toContain('CronJobDetailsPanel')
    expect(cronJobDetailsPanelSource).toContain('class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto"')
    expect(cronJobDetailsPanelSource).toContain('Job ID')
    expect(cronJobDetailsPanelSource).toContain('Prompt')
    expect(cronJobDetailsPanelSource).toContain('Recent run output')
    expect(cronJobDetailsPanelSource).not.toContain('max-h-56 overflow-auto')
    expect(cronJobDetailsPanelSource).not.toContain('max-h-36 overflow-auto')
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
