<script lang="ts">
  import { onMount } from 'svelte'

  import Panel from '@/app/components/ui/Panel.svelte'
  import { gatewayState } from '$lib/hermes/gateway'
  import { getProfileScope, refreshActiveProfile } from '$lib/hermes/profiles'
  import { initializeSessions, loadSessions, sessionState } from '$lib/hermes/sessions'
  import {
    EMPTY_MONITORING_METRICS,
    fetchMonitoringMetrics,
    formatBytes,
    formatPercent,
    formatUptime,
    monitoringConfig,
    type MonitoringMetrics
  } from '$lib/monitoring'
  import MainRenderPanel from './MainRenderPanel.svelte'
  import MainAgentPanel from './MainAgentPanel.svelte'
  import MainContainersPanel from './MainContainersPanel.svelte'
  import { agentRoute, cronRoute, kanbanRoute } from '../router.svelte'
  import { recentDashboardSessions } from './dashboard'

  type ThermalZone = MonitoringMetrics['thermal'][number]

  const dashboardPanelClass = 'h-auto min-h-0 border-line bg-surface transition-colors hover:border-line-strong md:h-full'
  const dashboardPanelTitleClass = 'text-ink-muted'
  const raisedPanelClass = 'min-h-0 !border-line !bg-surface-raised'
  const placeholderPanels = [
    {
      description: 'Calendar feed will land here once the dashboard endpoint exists.',
      headline: 'Chronos panel queued',
      title: 'CALENDAR',
      toneClass: 'text-primary'
    }
  ] as const
  const kanbanStats = [
    { label: 'Board', toneClass: 'text-primary', value: 'homelab' },
    { label: 'Cards', toneClass: 'text-secondary', value: '--' },
    { label: 'Blocked', toneClass: 'text-warning', value: '--' }
  ] as const

  let lastLoadedScope: null | string = null
  let profileRefreshStarted = false
  let monitoringMetrics = $state<MonitoringMetrics>(EMPTY_MONITORING_METRICS)
  let monitoringError = $state('')

  const monitoring = monitoringConfig()

  const connectionState = $derived(gatewayState.connectionState)
  const recentSessions = $derived(recentDashboardSessions(sessionState.sessions, 3))
  const miniSessionFallbackId = $derived(recentSessions[0]?.id ?? null)
  const agentHref = $derived(`#${agentRoute(miniSessionFallbackId)}`)
  const cronHref = $derived(`#${cronRoute()}`)
  const kanbanHref = $derived(`#${kanbanRoute()}`)
  const cpuThermal = $derived(findThermalZone(/cpu|package|pkg|core|tctl|tdie/i) ?? monitoringMetrics.thermal[0] ?? null)
  const monitoringSystemStats = $derived([
    {
      label: 'UPTIME',
      value: formatUptime(monitoringMetrics.uptimeSeconds)
    },
    {
      label: 'OS',
      value: monitoringMetrics.platform
    },
    {
      label: 'CPU NAME',
      value: monitoringMetrics.cpu.model
    },
    {
      label: 'TOTAL RAM',
      value: formatBytes(monitoringMetrics.memory.totalBytes)
    }
  ])
  const monitoringUsageRows = $derived([
    {
      detail: temperatureLabel(cpuThermal),
      label: 'CPU Usage',
      percent: monitoringMetrics.cpu.usagePercent,
      value: formatPercent(monitoringMetrics.cpu.usagePercent)
    },
    {
      detail: `${formatBytes(monitoringMetrics.memory.usedBytes)} / ${formatBytes(monitoringMetrics.memory.totalBytes)}`,
      label: 'Mem Usage',
      percent: monitoringMetrics.memory.usedPercent,
      value: formatPercent(monitoringMetrics.memory.usedPercent)
    },
    {
      detail: `${formatBytes(monitoringMetrics.disk.usedBytes)} / ${formatBytes(monitoringMetrics.disk.totalBytes)}`,
      label: 'Disk Usage',
      percent: monitoringMetrics.disk.usedPercent,
      value: formatPercent(monitoringMetrics.disk.usedPercent)
    }
  ])

  onMount(() => {
    void refreshActiveProfile()
    void refreshMonitoring()
    const timer = window.setInterval(() => void refreshMonitoring(), 2500)

    return () => window.clearInterval(timer)
  })

  $effect(() => {
    if (connectionState !== 'open') return

    if (!profileRefreshStarted) {
      profileRefreshStarted = true
      void refreshActiveProfile()
    }

    void initializeSessions()

    const scope = getProfileScope()
    if (scope !== lastLoadedScope) {
      lastLoadedScope = scope
      void loadSessions(0)
    }
  })

  async function refreshMonitoring(): Promise<void> {
    try {
      monitoringMetrics = await fetchMonitoringMetrics(monitoring)
      monitoringError = ''
    } catch (error) {
      monitoringError = error instanceof Error ? error.message : 'Monitoring unavailable'
    }
  }

  function barStyle(percent: number): string {
    return `width: ${Math.max(0, Math.min(100, percent))}%`
  }


  function findThermalZone(pattern: RegExp): ThermalZone | null {
    return monitoringMetrics.thermal.find(zone => pattern.test(zone.label)) ?? null
  }

  function temperatureLabel(zone: ThermalZone | null): string {
    return zone ? `${zone.celsius.toFixed(1)}°C` : '--°C'
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-canvas p-3 font-mono text-[11px] text-ink md:overflow-hidden" aria-label="Main dashboard">
  <div class="grid min-h-full grid-cols-1 gap-3 md:h-full md:min-h-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.12fr)_minmax(0,0.86fr)]">
    <section class="grid gap-3 md:min-h-0 md:grid-rows-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
      <Panel
        title="MONITORING"
        class={dashboardPanelClass}
        contentClass="flex h-full min-h-0 flex-col gap-3"
        titleClass={dashboardPanelTitleClass}
      >
        <div class="min-h-56 flex-1">
          <MainRenderPanel hostname={monitoringMetrics.systemName} metrics={monitoringMetrics} />
        </div>

        <section class="border-t border-line pt-2" aria-label="System information">
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[0.68rem] uppercase tracking-widest">
            {#each monitoringSystemStats as stat (stat.label)}
              <div class="grid min-w-0 gap-1 border-b border-line/60 pb-1">
                <dt class="text-ink-muted">{stat.label}</dt>
                <dd class="truncate text-ink-bright" title={stat.value}>{stat.value}</dd>
              </div>
            {/each}
          </dl>
        </section>

        <section class="border-t border-line pt-2" aria-label="Resource usage">
          <div class="grid gap-2 text-[0.68rem] uppercase tracking-widest">
            {#each monitoringUsageRows as row (row.label)}
              <div>
                <div class="mb-1 flex items-baseline justify-between gap-3">
                  <span class="text-ink-muted">{row.label}</span>
                  <span class="min-w-fit text-right text-ink-bright">{row.value} - {row.detail}</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-input">
                  <div class="h-full bg-ink-bright/70 transition-[width]" style={barStyle(row.percent)}></div>
                </div>
              </div>
            {/each}
          </div>
        </section>

        {#if monitoringError}
          <div class="shrink-0 border border-danger/40 bg-danger/10 p-2 text-[0.68rem] text-danger">
            {monitoringError}
          </div>
        {/if}
      </Panel>

      <MainContainersPanel
        class={dashboardPanelClass}
        titleClass={dashboardPanelTitleClass}
        metrics={monitoringMetrics}
        error={monitoringError}
      />
    </section>

    <div class="hidden h-full min-h-0 md:block">
      <MainAgentPanel fallbackSessionId={miniSessionFallbackId} />
    </div>

    <section class="grid gap-3 md:min-h-0 md:grid-rows-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.95fr)]">
      <Panel
        fullHeight={false}
        title="AGENT"
        badge="link"
        class={`${dashboardPanelClass} md:hidden`}
        contentClass="grid gap-3 p-3"
        titleClass={dashboardPanelTitleClass}
      >
        <div class="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-primary">Agent workspace moved to AGENT</div>
        <div class="text-[0.68rem] leading-4 text-ink-muted">
          Main stays telemetry-first on mobile. Open the AGENT tab for the live conversation and composer.
        </div>
        <a
          class="inline-flex w-fit items-center gap-2 rounded-control border border-primary/40 bg-primary/10 px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:border-primary hover:bg-primary/15 hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
          href={agentHref}
          aria-label="Open AGENT tab"
        >
          Open AGENT
          <span aria-hidden="true">→</span>
        </a>
      </Panel>
      {#each placeholderPanels as placeholder (placeholder.title)}
        <Panel
          fullHeight={false}
          title={placeholder.title}
          badge="placeholder"
          class={dashboardPanelClass}
          contentClass="grid h-full content-center gap-2"
          titleClass={dashboardPanelTitleClass}
        >
          <div class={`text-[0.78rem] font-bold uppercase tracking-[0.14em] ${placeholder.toneClass}`}>
            {placeholder.headline}
          </div>
          <div class="text-[0.68rem] leading-4 text-ink-muted">{placeholder.description}</div>
        </Panel>
      {/each}

      <Panel
        fullHeight={false}
        title="CRON"
        badge="ready"
        class={dashboardPanelClass}
        contentClass="grid h-full content-center gap-2"
        titleClass={dashboardPanelTitleClass}
      >
        <div class="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-secondary">Scheduler surface online</div>
        <div class="text-[0.68rem] leading-4 text-ink-muted">
          Cron route manages Hermes jobs through the authenticated dashboard cron API. No local scheduler shim, no fake controls.
        </div>
        <a
          class="w-fit rounded-control border border-secondary/40 px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-secondary hover:border-secondary/70 hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
          href={cronHref}
          aria-label="Open Cron Job Manager"
        >
          Open Cron
        </a>
      </Panel>

      <Panel
        fullHeight={false}
        title="KANBAN"
        badge="ready"
        class={dashboardPanelClass}
        contentClass="grid h-full content-center gap-2"
        titleClass={dashboardPanelTitleClass}
      >
        <div class="grid grid-cols-3 gap-2 text-center uppercase tracking-[0.12em]">
          {#each kanbanStats as stat (stat.label)}
            <Panel flat fullHeight={false} padded={false} class={raisedPanelClass} contentClass="p-2">
              <div class="text-[0.65rem] text-ink-muted">{stat.label}</div>
              <div class={`mt-1 ${stat.toneClass}`}>{stat.value}</div>
            </Panel>
          {/each}
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[0.68rem] leading-4 text-ink-muted">
          <span>Kanban route is wired through the authenticated dashboard plugin API.</span>
          <a
            class="rounded-control border border-primary/40 px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-primary hover:border-primary/70 hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
            href={kanbanHref}
            aria-label="Open Kanban board"
          >
            Open Kanban
          </a>
        </div>
      </Panel>

    </section>
  </div>
</section>
