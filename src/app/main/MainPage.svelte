<script lang="ts">
  import { onMount } from 'svelte'

  import Panel from '@/app/components/ui/Panel.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { getProfileScope, refreshActiveProfile } from '$lib/stores/profile.svelte'
  import { initializeSessions, loadSessions, sessionState } from '$lib/stores/session.svelte'
  import {
    EMPTY_HOST_METRICS,
    fetchHostMetrics,
    formatBytes,
    formatPercent,
    formatUptime,
    hostMonitorConfig,
    sortHostProcesses,
    type HostMetrics,
    type HostProcessMetrics,
    type HostProcessSortDirection,
    type HostProcessSortKey
  } from '$lib/host-monitor'
  import MainRenderPanel from './MainRenderPanel.svelte'
  import MainAgentPanel from './MainAgentPanel.svelte'
  import { recentDashboardSessions } from './dashboard'

  type ThermalZone = HostMetrics['thermal'][number]

  const dashboardPanelClass = 'min-h-0 border-line bg-surface transition-colors hover:border-line-strong'
  const dashboardPanelTitleClass = 'text-ink-muted'
  const raisedPanelClass = 'min-h-0 !border-line !bg-surface-raised'
  const placeholderPanels = [
    {
      description: 'Calendar feed will land here once the dashboard endpoint exists.',
      headline: 'Chronos panel queued',
      title: 'CALENDAR',
      toneClass: 'text-primary'
    },
    {
      description: 'No fake job controls; this card is a reserved operations panel.',
      headline: 'Scheduler surface pending',
      title: 'CRON',
      toneClass: 'text-secondary'
    }
  ] as const
  const kanbanStats = [
    { label: 'Board', toneClass: 'text-primary', value: 'homelab' },
    { label: 'Cards', toneClass: 'text-secondary', value: '--' },
    { label: 'Blocked', toneClass: 'text-warning', value: '--' }
  ] as const

  let lastLoadedScope: null | string = null
  let profileRefreshStarted = false
  let hostMetrics = $state<HostMetrics>(EMPTY_HOST_METRICS)
  let hostMonitorError = $state('')
  let hostMonitorUpdatedAt = $state<null | number>(null)
  let processSortKey = $state<HostProcessSortKey>('cpu')
  let processSortDirection = $state<HostProcessSortDirection>('desc')

  const hostMonitor = hostMonitorConfig()

  const connectionState = $derived(gatewayState.connectionState)
  const recentSessions = $derived(recentDashboardSessions(sessionState.sessions, 3))
  const miniSessionFallbackId = $derived(recentSessions[0]?.id ?? null)
  const cpuThermal = $derived(findThermalZone(/cpu|package|pkg|core|tctl|tdie/i) ?? hostMetrics.thermal[0] ?? null)
  const processRows = $derived(
    sortHostProcesses(hostMetrics.processes, processSortKey, processSortDirection).slice(0, 12)
  )
  const processCount = $derived(hostMetrics.processCount || hostMetrics.processes.length)
  const hardwareStats = $derived([
    {
      detail: hostMetrics.hostname,
      label: 'UPTIME',
      value: formatUptime(hostMetrics.uptimeSeconds),
      valueClass: 'text-primary'
    },
    {
      detail: `${temperatureLabel(cpuThermal)} temp`,
      label: 'CPU',
      value: `${formatPercent(hostMetrics.cpu.usagePercent)} usage`,
      valueClass: 'text-primary'
    },
    {
      detail: `RAM: ${formatBytes(hostMetrics.memory.totalBytes)}`,
      label: 'RAM',
      value: `${formatPercent(hostMetrics.memory.usedPercent)} usage`,
      valueClass: 'text-success'
    },
    {
      detail: '',
      label: 'DISK',
      value: `${formatPercent(hostMetrics.disk.usedPercent)} usage`,
      valueClass: 'text-secondary'
    }
  ])
  const hardwareUsageRows = $derived([
    {
      barClass: 'bg-primary',
      label: 'CPU',
      percent: hostMetrics.cpu.usagePercent,
      value: formatPercent(hostMetrics.cpu.usagePercent)
    },
    {
      barClass: 'bg-success',
      label: 'RAM',
      percent: hostMetrics.memory.usedPercent,
      value: formatBytes(hostMetrics.memory.totalBytes)
    },
    {
      barClass: 'bg-secondary',
      label: 'DISK',
      percent: hostMetrics.disk.usedPercent,
      value: formatPercent(hostMetrics.disk.usedPercent)
    }
  ])

  onMount(() => {
    void refreshActiveProfile()
    void refreshHostMonitor()
    const timer = window.setInterval(() => void refreshHostMonitor(), 2500)

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

  async function refreshHostMonitor(): Promise<void> {
    try {
      hostMetrics = await fetchHostMetrics(hostMonitor)
      hostMonitorUpdatedAt = Date.now()
      hostMonitorError = ''
    } catch (error) {
      hostMonitorError = error instanceof Error ? error.message : 'Host monitor unavailable'
    }
  }

  function toggleProcessSort(key: HostProcessSortKey): void {
    if (processSortKey === key) {
      processSortDirection = processSortDirection === 'desc' ? 'asc' : 'desc'
      return
    }

    processSortKey = key
    processSortDirection = 'desc'
  }

  function processSortLabel(key: HostProcessSortKey): string {
    if (processSortKey !== key) return ''
    return processSortDirection === 'desc' ? ' ↓' : ' ↑'
  }

  function processSortAriaLabel(key: HostProcessSortKey, label: string): string {
    const nextDirection = processSortKey === key && processSortDirection === 'desc' ? 'ascending' : 'descending'
    return `Sort processes by ${label} ${nextDirection}`
  }

  function barStyle(percent: number): string {
    return `width: ${Math.max(0, Math.min(100, percent))}%`
  }

  function updatedLabel(): string {
    if (!hostMonitorUpdatedAt) return 'awaiting first sample'
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
      new Date(hostMonitorUpdatedAt)
    )
  }

  function findThermalZone(pattern: RegExp): ThermalZone | null {
    return hostMetrics.thermal.find(zone => pattern.test(zone.label)) ?? null
  }

  function temperatureLabel(zone: ThermalZone | null): string {
    return zone ? `${zone.celsius.toFixed(1)}°C` : '--°C'
  }

  function processMemoryLabel(process: HostProcessMetrics): string {
    return formatBytes(process.memoryBytes)
  }

</script>

<section class="h-full min-h-0 overflow-hidden bg-canvas p-3 font-mono text-[11px] text-ink" aria-label="Main dashboard">
  <div class="grid h-full min-h-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.12fr)_minmax(0,0.86fr)] gap-3">
    <section class="grid min-h-0 grid-rows-[minmax(0,1.45fr)_minmax(0,0.55fr)] gap-3">
      <Panel
        title="HARDWARE"
        class={dashboardPanelClass}
        contentClass="flex h-full min-h-0 flex-col gap-3"
        titleClass={dashboardPanelTitleClass}
      >
      <div class="min-h-56 flex-1">
        <MainRenderPanel metrics={hostMetrics} />
      </div>

      <div class="grid shrink-0 grid-cols-2 gap-2 text-[0.68rem] uppercase tracking-widest xl:grid-cols-4">
        {#each hardwareStats as stat (stat.label)}
          <Panel flat fullHeight={false} padded={false} class={raisedPanelClass} contentClass="p-2">
            <div class="text-ink-muted">{stat.label}</div>
            <div class={`mt-1 ${stat.valueClass}`}>{stat.value}</div>
            {#if stat.detail}
              <div class="mt-1 truncate text-ink-muted">{stat.detail}</div>
            {/if}
          </Panel>
        {/each}
      </div>

      <div class="grid shrink-0 gap-2 text-[0.68rem] uppercase tracking-widest xl:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
        <Panel flat fullHeight={false} padded={false} class={raisedPanelClass} contentClass="p-2">
          <div class="mb-2 flex items-center justify-between text-ink-muted">
            <span>USAGE</span>
            <span>{updatedLabel()}</span>
          </div>
          <div class="grid gap-1.5">
            {#each hardwareUsageRows as row (row.label)}
              <div>
                <div class="mb-1 flex justify-between text-ink-muted">
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-input">
                  <div class={`h-full ${row.barClass}`} style={barStyle(row.percent)}></div>
                </div>
              </div>
            {/each}
          </div>
        </Panel>

        <Panel flat fullHeight={false} padded={false} class={raisedPanelClass} contentClass="p-2">
          <div class="mb-2 flex items-center justify-between text-ink-muted">
            <span>TEMPS</span>
            <span>{hostMetrics.thermal.length}</span>
          </div>
          {#if hostMetrics.thermal.length}
            <div class="grid gap-1">
              {#each hostMetrics.thermal.slice(0, 4) as zone (zone.label)}
                <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <span class="truncate text-ink-muted">{zone.label}</span>
                  <span class="text-warning">{zone.celsius.toFixed(1)}°C</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="border border-dashed border-line p-2 text-ink-muted">No thermal sensors reported.</div>
          {/if}
        </Panel>
      </div>

      {#if hostMonitorError}
        <div class="shrink-0 border border-danger/40 bg-danger/10 p-2 text-[0.68rem] text-danger">{hostMonitorError}</div>
      {/if}
      </Panel>

      <Panel
        title="PROCESS"
        class={dashboardPanelClass}
        contentClass="flex h-full min-h-0 flex-col gap-2"
        titleClass={dashboardPanelTitleClass}
      >
      <div class="flex shrink-0 items-center justify-between border border-line bg-surface-raised px-2 py-1 text-[0.66rem] uppercase tracking-[0.12em] text-ink-muted">
        <span>{processCount} processes</span>
        <span>sort: {processSortKey}/{processSortDirection}</span>
      </div>

      <div class="grid shrink-0 grid-cols-[minmax(0,1fr)_3.6rem_5.6rem] gap-2 border-b border-line px-2 pb-1 text-[0.64rem] uppercase tracking-[0.12em] text-ink-muted">
        <span>Process</span>
        <button
          class="justify-self-end rounded-sm border-none bg-transparent p-0 text-right font-mono text-[0.64rem] uppercase tracking-[0.12em] text-primary transition-colors hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          type="button"
          aria-pressed={processSortKey === 'cpu'}
          aria-label={processSortAriaLabel('cpu', 'CPU')}
          onclick={() => toggleProcessSort('cpu')}
        >
          CPU{processSortLabel('cpu')}
        </button>
        <button
          class="justify-self-end rounded-sm border-none bg-transparent p-0 text-right font-mono text-[0.64rem] uppercase tracking-[0.12em] text-primary transition-colors hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          type="button"
          aria-pressed={processSortKey === 'memory'}
          aria-label={processSortAriaLabel('memory', 'memory')}
          onclick={() => toggleProcessSort('memory')}
        >
          MEM{processSortLabel('memory')}
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-auto" aria-label="Process">
        {#if processRows.length}
          <div class="grid gap-1">
            {#each processRows as process (process.pid || process.command)}
              <div class="grid grid-cols-[minmax(0,1fr)_3.6rem_5.6rem] gap-2 border border-line bg-surface-raised px-2 py-1.5">
                <div class="min-w-0">
                  <div class="truncate text-ink-bright">{process.name}</div>
                  <div class="truncate text-[0.62rem] text-ink-muted">
                    {process.user || process.status || process.command}
                  </div>
                </div>
                <div class="self-center text-right text-primary">{formatPercent(process.cpuPercent)}</div>
                <div class="self-center text-right text-secondary">{processMemoryLabel(process)}</div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="border border-dashed border-line p-3 text-[0.68rem] text-ink-muted">
            {hostMonitorError ? 'Process data unavailable while host monitor is degraded.' : 'Awaiting process sample.'}
          </div>
        {/if}
      </div>
      </Panel>
    </section>

    <MainAgentPanel fallbackSessionId={miniSessionFallbackId} />

    <section class="grid min-h-0 grid-rows-[0.8fr_0.8fr_0.95fr] gap-3">
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
        title="KANBAN"
        badge="placeholder"
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
        <div class="text-[0.68rem] leading-4 text-ink-muted">Summary endpoint not wired yet. The panel exists; the lie does not.</div>
      </Panel>

    </section>
  </div>
</section>
