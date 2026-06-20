<script lang="ts">
  import { onMount } from 'svelte'

  import Panel from '@/components/ui/Panel.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { getProfileScope, profileState, refreshActiveProfile } from '$lib/stores/profile.svelte'
  import { initializeSessions, loadSessions, sessionState } from '$lib/stores/session.svelte'
  import {
    EMPTY_HOST_METRICS,
    fetchHostMetrics,
    formatBytes,
    formatPercent,
    formatUptime,
    hostMonitorConfig,
    type HostMetrics
  } from '$lib/host-monitor'
  import RenderGeoPanel from './RenderGeoPanel.svelte'
  import { dashboardConnectionSummary, recentDashboardSessions, type DashboardConnectionTone } from './dashboard'

  let lastLoadedScope: null | string = null
  let profileRefreshStarted = false
  let hostMetrics = $state<HostMetrics>(EMPTY_HOST_METRICS)
  let hostMonitorError = $state('')
  let hostMonitorUpdatedAt = $state<null | number>(null)

  const pipSlots = Array.from({ length: 20 }, (_, index) => index)
  const hostMonitor = hostMonitorConfig()

  const connectionState = $derived(gatewayState.connectionState)
  const connection = $derived(
    dashboardConnectionSummary({
      activeProfile: profileState.activeGatewayProfile,
      detail: gatewayState.connectionDetail,
      state: gatewayState.connectionState,
      target: gatewayState.connectionTarget
    })
  )
  const recentSessions = $derived(recentDashboardSessions(sessionState.sessions, 3))
  const activeProfile = $derived(
    profileState.profiles.find(profile => profile.name === profileState.activeGatewayProfile) ?? null
  )
  const coreRows = $derived(
    (hostMetrics.cpu.perCorePercent.length
      ? hostMetrics.cpu.perCorePercent
      : Array.from({ length: Math.max(1, hostMetrics.cpu.cores || 4) }, () => 0)
    ).slice(0, 12)
  )
  const thermalLabel = $derived(
    hostMetrics.thermal.length ? `${hostMetrics.thermal[0].label} ${hostMetrics.thermal[0].celsius.toFixed(1)}°C` : 'No thermal zone'
  )
  const monitorStatus = $derived(hostMonitorError ? 'degraded' : hostMonitorUpdatedAt ? 'live' : 'syncing')
  const monitorStatusClass = $derived(
    hostMonitorError ? 'border-danger/45 bg-danger/10 text-danger' : 'border-success/45 bg-success/10 text-success'
  )

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

  function connectionToneClass(tone: DashboardConnectionTone): string {
    if (tone === 'good') return 'border-success/45 bg-success/10 text-success'
    if (tone === 'busy') return 'border-secondary/45 bg-secondary/10 text-secondary'
    if (tone === 'bad') return 'border-danger/55 bg-danger/10 text-danger'
    return 'border-line-strong bg-surface-raised/70 text-ink-muted'
  }

  function pipClass(index: number, percent: number): string {
    const activePips = Math.round(Math.max(0, Math.min(100, percent)) / 5)
    if (index >= activePips) return 'bg-input'
    if (index > 16) return 'bg-danger'
    if (index > 12) return 'bg-warning'
    return 'bg-primary'
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
</script>

<section class="h-full min-h-0 overflow-hidden bg-canvas p-3 font-mono text-[11px] text-ink" aria-label="Main dashboard">
  <div class="grid h-full min-h-0 grid-rows-[40px_minmax(0,1fr)_28px] gap-3">
    <header class="flex items-center justify-between border-b border-line pb-2">
      <div class="flex min-w-0 items-center gap-3">
        <div class="text-[1.05rem] font-bold tracking-[0.22em] text-warning">BITCH_OS</div>
        <div class="border border-line px-2 py-0.5 text-[0.68rem] uppercase tracking-[0.18em] text-ink-muted">
          main.ops.live
        </div>
        <div class={`hidden border px-2 py-0.5 text-[0.68rem] uppercase tracking-[0.14em] sm:inline-flex ${monitorStatusClass}`}>
          host {monitorStatus}
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2 text-right">
        <div class={`border px-2 py-0.5 text-[0.78rem] font-bold uppercase tracking-[0.16em] ${connectionToneClass(connection.tone)}`}>
          {connection.label}
        </div>
        <div class="hidden text-[0.68rem] uppercase tracking-[0.14em] text-ink-muted md:block">
          HOST UPTIME <span class="text-ink">{formatUptime(hostMetrics.uptimeSeconds)}</span>
        </div>
      </div>
    </header>

    <div class="grid min-h-0 grid-cols-[1.12fr_0.92fr_0.86fr] gap-3">
      <Panel
        fullHeight={false}
        title="HARDWARE_GEO"
        class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
        contentClass="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-2"
        titleClass="text-ink-muted"
      >
        <RenderGeoPanel metrics={hostMetrics} />
        <div class="border-t border-dashed border-line pt-2 text-[0.72rem] uppercase tracking-[0.08em]">
          <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
            <span class="text-ink-muted">CPU_MODEL</span>
            <span class="truncate text-right text-warning">{hostMetrics.cpu.model || 'LINK_V4'}</span>
            <span class="text-ink-muted">ACTIVE_CORES</span>
            <span class="text-right text-primary">{hostMetrics.cpu.cores || coreRows.length}</span>
            <span class="text-ink-muted">CPU_LOAD</span>
            <span class="text-right text-primary">{formatPercent(hostMetrics.cpu.usagePercent)}</span>
            <span class="text-ink-muted">RAM_USED</span>
            <span class="text-right text-success">
              {formatBytes(hostMetrics.memory.usedBytes)} / {formatBytes(hostMetrics.memory.totalBytes)}
            </span>
          </div>
        </div>
      </Panel>

      <section class="grid min-h-0 grid-rows-[0.9fr_0.82fr_0.78fr] gap-3">
        <Panel
          fullHeight={false}
          title="CPU_STATS"
          badge={formatPercent(hostMetrics.cpu.usagePercent)}
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-1.5"
          titleClass="text-ink-muted"
        >
          {#each coreRows as percent, index}
            <div class="flex items-center gap-2">
              <div class="w-8 text-[0.68rem] text-ink-muted">C{index}</div>
              <div class="flex h-2 flex-1 gap-0.5 rounded-sm bg-input">
                {#each pipSlots as pip}
                  <span class={`h-full flex-1 ${pipClass(pip, percent)}`}></span>
                {/each}
              </div>
              <div class="w-10 text-right text-[0.68rem] text-primary">{formatPercent(percent)}</div>
            </div>
          {/each}
        </Panel>

        <Panel
          fullHeight={false}
          title="MEMORY_STATS"
          badge={formatPercent(hostMetrics.memory.usedPercent)}
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-3"
          titleClass="text-ink-muted"
        >
          <div>
            <div class="mb-1 flex justify-between text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">
              <span>RAM</span>
              <span>{formatBytes(hostMetrics.memory.usedBytes)} / {formatBytes(hostMetrics.memory.totalBytes)}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-input">
              <div class="h-full bg-success" style={barStyle(hostMetrics.memory.usedPercent)}></div>
            </div>
          </div>
          <div>
            <div class="mb-1 flex justify-between text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">
              <span>SWAP</span>
              <span>{formatBytes(hostMetrics.memory.swapUsedBytes)} / {formatBytes(hostMetrics.memory.swapTotalBytes)}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-input">
              <div class="h-full bg-secondary" style={barStyle(hostMetrics.memory.swapUsedPercent)}></div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[0.7rem] uppercase tracking-[0.1em]">
            <div class="border border-line bg-surface-raised p-2">
              <div class="text-ink-muted">LOAD_AVG</div>
              <div class="mt-1 text-primary">{hostMetrics.cpu.loadAverage.slice(0, 3).join(' / ') || '0 / 0 / 0'}</div>
            </div>
            <div class="border border-line bg-surface-raised p-2">
              <div class="text-ink-muted">THERMAL</div>
              <div class="mt-1 truncate text-warning">{thermalLabel}</div>
            </div>
          </div>
        </Panel>

        <Panel
          fullHeight={false}
          title="HOST_LINK"
          badge={hostMonitor.port}
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-2"
          titleClass="text-ink-muted"
        >
          <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.68rem] uppercase tracking-[0.1em]">
            <span class="text-ink-muted">ENDPOINT</span>
            <span class="truncate text-right text-primary">{hostMonitor.metricsUrl}</span>
            <span class="text-ink-muted">UPDATED</span>
            <span class="text-right text-success">{updatedLabel()}</span>
            <span class="text-ink-muted">PROCESSES</span>
            <span class="text-right text-ink">{hostMetrics.processCount}</span>
            <span class="text-ink-muted">HOSTNAME</span>
            <span class="truncate text-right text-ink">{hostMetrics.hostname}</span>
          </div>
          {#if hostMonitorError}
            <div class="border border-danger/40 bg-danger/10 p-2 text-[0.68rem] text-danger">{hostMonitorError}</div>
          {/if}
        </Panel>
      </section>

      <section class="grid min-h-0 grid-rows-[0.8fr_0.8fr_0.95fr_0.85fr] gap-3">
        <Panel
          fullHeight={false}
          title="CALENDAR"
          badge="placeholder"
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-2"
          titleClass="text-ink-muted"
        >
          <div class="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-primary">Chronos panel queued</div>
          <div class="text-[0.68rem] leading-4 text-ink-muted">Calendar feed will land here once the dashboard endpoint exists.</div>
        </Panel>

        <Panel
          fullHeight={false}
          title="CRON"
          badge="placeholder"
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-2"
          titleClass="text-ink-muted"
        >
          <div class="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-secondary">Scheduler surface pending</div>
          <div class="text-[0.68rem] leading-4 text-ink-muted">No fake job controls; this card is a reserved operations panel.</div>
        </Panel>

        <Panel
          fullHeight={false}
          title="KANBAN_SUMMARY"
          badge="placeholder"
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-2"
          titleClass="text-ink-muted"
        >
          <div class="grid grid-cols-3 gap-2 text-center uppercase tracking-[0.12em]">
            <div class="border border-line bg-surface-raised p-2">
              <div class="text-[0.65rem] text-ink-muted">Board</div>
              <div class="mt-1 text-primary">homelab</div>
            </div>
            <div class="border border-line bg-surface-raised p-2">
              <div class="text-[0.65rem] text-ink-muted">Cards</div>
              <div class="mt-1 text-secondary">--</div>
            </div>
            <div class="border border-line bg-surface-raised p-2">
              <div class="text-[0.65rem] text-ink-muted">Blocked</div>
              <div class="mt-1 text-warning">--</div>
            </div>
          </div>
          <div class="text-[0.68rem] leading-4 text-ink-muted">Summary endpoint not wired yet. The panel exists; the lie does not.</div>
        </Panel>

        <Panel
          fullHeight={false}
          title="THREADS"
          badge={`${sessionState.sessionsTotal} indexed`}
          class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="grid h-full content-center gap-1.5"
          titleClass="text-ink-muted"
        >
          {#if recentSessions.length}
            {#each recentSessions as session (session.id)}
              <a class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border border-line bg-surface-raised px-2 py-1.5" href={session.href}>
                <span class="truncate text-[0.68rem] text-ink">{session.title}</span>
                <span class="text-[0.64rem] uppercase tracking-[0.12em] text-primary">{session.status}</span>
              </a>
            {/each}
          {:else}
            <div class="border border-dashed border-line p-3 text-[0.68rem] text-ink-muted">
              {sessionState.sessionsLoading ? 'Syncing session index…' : 'No recent sessions in scope.'}
            </div>
          {/if}
        </Panel>
      </section>
    </div>

    <footer class="flex items-center justify-between border-t border-line pt-1.5 text-[0.66rem] uppercase tracking-[0.15em] text-ink-muted">
      <div>MODE: <span class="font-bold text-secondary">REMOTE_ACCESS</span></div>
      <div>GATEWAY: <span class="text-primary">{connection.target}</span></div>
      <div>PROFILE: <span class="text-success">{activeProfile?.name ?? connection.profile}</span></div>
    </footer>
  </div>
</section>
