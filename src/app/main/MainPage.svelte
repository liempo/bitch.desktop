<script lang="ts">
  import { onMount } from 'svelte'

  import Icon from '@/app/components/ui/Icon.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
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
  import MainAgentPanel from './panels/MainAgentPanel.svelte'
  import MainCalendarPanel from './panels/MainCalendarPanel.svelte'
  import MainContainersPanel from './panels/MainContainersPanel.svelte'
  import MainCronPanel from './panels/MainCronPanel.svelte'
  import MainGlyphPanel from './panels/MainGlyphPanel.svelte'
  import MainKanbanPanel from './panels/MainKanbanPanel.svelte'
  import { agentRoute } from '../router.svelte'
  import { recentDashboardSessions } from './dashboard'

  type ThermalZone = MonitoringMetrics['thermal'][number]

  const dashboardPanelClass = 'h-auto min-h-0 border-line !bg-canvas transition-colors hover:border-line-strong md:h-full'
  const dashboardAutoPanelClass = 'h-auto min-h-0 border-line !bg-canvas transition-colors hover:border-line-strong'
  const dashboardPanelTitleClass = 'text-ink-muted'


  let lastLoadedScope: null | string = null
  let profileRefreshStarted = false
  let monitoringMetrics = $state<MonitoringMetrics>(EMPTY_MONITORING_METRICS)
  let monitoringError = $state('')

  const monitoring = monitoringConfig()

  const connectionState = $derived(gatewayState.connectionState)
  const recentSessions = $derived(recentDashboardSessions(sessionState.sessions, 3))
  const miniSessionFallbackId = $derived(recentSessions[0]?.id ?? null)
  const newAgentHref = `#${agentRoute()}`
  const mobileAgentSession = $derived(recentSessions[0] ?? null)
  const mobileAgentSessionTitle = $derived(compactSessionText(mobileAgentSession?.title) || 'Start a new session')
  const mobileAgentStatusLabel = $derived(
    connectionState === 'open' ? 'online' : connectionState === 'connecting' ? 'syncing' : 'offline'
  )
  const mobileAgentStatusClass = $derived(
    connectionState === 'open' ? 'text-success' : connectionState === 'connecting' ? 'text-warning' : 'text-danger'
  )
  const mobileAgentSessionCountLabel = $derived(
    `${sessionState.sessions.length} ${sessionState.sessions.length === 1 ? 'session' : 'sessions'}`
  )
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
    const monitoringTimer = window.setInterval(() => void refreshMonitoring(), 2500)

    return () => window.clearInterval(monitoringTimer)
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

  function compactSessionText(value: null | string | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function findThermalZone(pattern: RegExp): ThermalZone | null {
    return monitoringMetrics.thermal.find(zone => pattern.test(zone.label)) ?? null
  }

  function temperatureLabel(zone: ThermalZone | null): string {
    return zone ? `${zone.celsius.toFixed(1)}°C` : '--°C'
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-canvas p-3 font-mono text-[11px] text-ink md:overflow-hidden" aria-label="Main dashboard">
  <div class="grid min-h-full min-w-0 grid-cols-1 gap-4 md:h-full md:min-h-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.12fr)_minmax(0,0.86fr)]">
    <section class="contents min-w-0 md:grid md:min-h-0 md:gap-4 md:grid-rows-[minmax(0,0.85fr)_auto_minmax(0,1fr)]">
      <MainGlyphPanel
        class={`${dashboardPanelClass} min-h-56 md:min-h-0`}
        titleClass={dashboardPanelTitleClass}
        hostname={monitoringMetrics.systemName}
        metrics={monitoringMetrics}
      />

      <Panel
        fullHeight={false}
        title="MONITORING"
        padded={false}
        class={`${dashboardAutoPanelClass} order-5 md:order-0`}
        contentClass="flex min-h-0 flex-col gap-2.5 p-3 pt-4"
        titleClass={dashboardPanelTitleClass}
      >
        <section aria-label="System information">
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
        class={`${dashboardPanelClass} order-6 md:order-0`}
        titleClass={dashboardPanelTitleClass}
        metrics={monitoringMetrics}
        error={monitoringError}
      />
    </section>

    <div class="hidden h-full min-h-0 min-w-0 md:block">
      <MainAgentPanel fallbackSessionId={miniSessionFallbackId} />
    </div>

    <section class="contents min-w-0 md:grid md:min-h-0 md:gap-4 md:grid-rows-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.95fr)]">
      <Panel
        fullHeight={false}
        title="AGENT"
        class={`${dashboardPanelClass} order-2 md:hidden md:order-0`}
        contentClass="grid gap-4 p-3 pt-4"
        titleClass={dashboardPanelTitleClass}
      >
        <div class="grid grid-cols-2 gap-2 uppercase tracking-[0.12em]">
          <div class="border border-line bg-canvas px-2 py-1.5">
            <div class="text-[0.58rem] text-ink-muted">Gateway</div>
            <div class={`mt-1 text-[0.68rem] font-bold ${mobileAgentStatusClass}`}>
              {#if connectionState === 'connecting'}
                <Loader size="sm" tone="secondary" label="Connecting to gateway" />
              {:else}
                {mobileAgentStatusLabel}
              {/if}
            </div>
          </div>
          <div class="border border-line bg-canvas px-2 py-1.5">
            <div class="text-[0.58rem] text-ink-muted">Index</div>
            <div class="mt-1 truncate text-[0.68rem] font-bold text-ink-bright">{mobileAgentSessionCountLabel}</div>
          </div>
        </div>

        {#if mobileAgentSession}
          <a
            class="block min-w-0 border border-line bg-canvas p-3 text-inherit transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            href={mobileAgentSession.href}
            aria-label={`Open AGENT session ${mobileAgentSessionTitle}`}
          >
            <div class="text-[0.58rem] uppercase tracking-[0.14em] text-ink-muted">Last session</div>
            <div class="mt-1 truncate text-[0.76rem] font-bold uppercase tracking-widest text-primary" title={mobileAgentSessionTitle}>
              {mobileAgentSessionTitle}
            </div>
            <div class="mt-2 flex items-center justify-between gap-3 text-[0.66rem] leading-4 text-ink-muted">
              <span class="min-w-0 truncate">Resume thread and composer</span>
              <Icon name="arrowRight" class="shrink-0 text-primary" />
            </div>
          </a>
        {:else}
          <div class="min-w-0 border border-line bg-canvas p-3">
            <div class="text-[0.58rem] uppercase tracking-[0.14em] text-ink-muted">No active session</div>
            <div class="mt-1 truncate text-[0.76rem] font-bold uppercase tracking-widest text-primary" title={mobileAgentSessionTitle}>
              {mobileAgentSessionTitle}
            </div>
            <div class="mt-2 text-[0.66rem] leading-4 text-ink-muted">
              Main stays telemetry-first at this size. Jump into AGENT for the live thread, composer, and session controls.
            </div>
          </div>
        {/if}

        <a
          class="block min-w-0 border border-line bg-canvas p-3 text-inherit transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
          href={newAgentHref}
          aria-label="Start a new AGENT session"
        >
          <div class="text-[0.58rem] uppercase tracking-[0.14em] text-ink-muted">New session</div>
          <div class="mt-1 truncate text-[0.76rem] font-bold uppercase tracking-widest text-primary">Start blank thread</div>
          <div class="mt-2 flex items-center justify-between gap-3 text-[0.66rem] leading-4 text-ink-muted">
            <span class="min-w-0 truncate">Open composer in AGENT</span>
            <Icon name="arrowRight" class="shrink-0 text-primary" />
          </div>
        </a>
      </Panel>
      <MainCalendarPanel class={`${dashboardPanelClass} hidden md:flex`} titleClass={dashboardPanelTitleClass} />

      <MainCronPanel class={`${dashboardPanelClass} order-4 md:order-0`} titleClass={dashboardPanelTitleClass} />

      <MainKanbanPanel class={`${dashboardPanelClass} order-3 md:order-0`} titleClass={dashboardPanelTitleClass} />
    </section>
  </div>
</section>
