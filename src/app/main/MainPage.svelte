<script lang="ts">
  import { onMount } from 'svelte'

  import Panel from '@/components/ui/Panel.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { getProfileScope, profileState, refreshActiveProfile } from '$lib/stores/profile.svelte'
  import { initializeSessions, loadSessions, sessionState } from '$lib/stores/session.svelte'
  import {
    dashboardConnectionSummary,
    dashboardQuickLinks,
    recentDashboardSessions,
    type DashboardConnectionTone,
    type DashboardUtilityState
  } from './dashboard'

  let lastLoadedScope: null | string = null
  let profileRefreshStarted = false

  const pipSlots = Array.from({ length: 20 }, (_, index) => index)
  const fpsBars = Array.from({ length: 30 }, (_, index) => index)
  const radarAxes = ['CPU', 'MEM', 'THREAD', 'IO', 'AUTH', 'FS']
  const meshLines = ['╱╲  ╱╲', '╲ ╳╳ ╱', '╱ ╳╳ ╲', '╲╱  ╲╱']

  const connectionState = $derived(gatewayState.connectionState)
  const connection = $derived(
    dashboardConnectionSummary({
      activeProfile: profileState.activeGatewayProfile,
      detail: gatewayState.connectionDetail,
      state: gatewayState.connectionState,
      target: gatewayState.connectionTarget
    })
  )
  const quickLinks = $derived(dashboardQuickLinks(sessionState.storedSessionId))
  const recentSessions = $derived(recentDashboardSessions(sessionState.sessions, 8))
  const activeProfile = $derived(
    profileState.profiles.find(profile => profile.name === profileState.activeGatewayProfile) ?? null
  )
  const visibleProfiles = $derived(profileState.profiles.slice(0, 4))
  const profileCount = $derived(profileState.profiles.length || 0)
  const sessionCount = $derived(sessionState.sessionsTotal || sessionState.sessions.length || 0)
  const activeSessionCount = $derived(sessionState.sessions.filter(session => session.is_active && !session.archived).length)
  const uptimeLabel = $derived(`${String(Math.floor(sessionCount / 60)).padStart(2, '0')}:${String(sessionCount % 60).padStart(2, '0')}:00`)
  const powerLevel = $derived(connection.tone === 'good' ? 100 : connection.tone === 'busy' ? 72 : connection.tone === 'bad' ? 18 : 44)
  const frameMs = $derived(connection.tone === 'good' ? '16.67' : connection.tone === 'busy' ? '24.21' : connection.tone === 'bad' ? '99.90' : '--')
  const cpuTemp = $derived(connection.tone === 'bad' ? 77 : connection.tone === 'busy' ? 58 : 45)
  const processingRows = $derived(
    Array.from({ length: 8 }, (_, index) => {
      const load = Math.max(3, Math.min(20, ((sessionCount + profileCount * 3 + index * 4) % 18) + 3))
      return { active: load, label: `C${index}` }
    })
  )
  const taskRows = $derived(
    recentSessions.map((session, index) => ({
      cmd: session.title,
      cpu: `${Math.max(1, Math.min(99, Math.round(((session.id.length + index * 7) % 21) + (session.status === 'active' ? 12 : 2))))}.0%`,
      pid: session.id.slice(0, 8),
      profile: session.profile,
      status: session.status
    }))
  )
  const logRows = $derived([
    `[${connection.label}] ${connection.detail}`,
    `PROFILE ${connection.profile} :: ${activeProfile?.provider ?? 'provider unknown'} / ${activeProfile?.model ?? 'model pending'}`,
    `SESSION_INDEX ${sessionCount} records :: ${activeSessionCount} active`,
    profileState.error ? `PROFILE_PROBE ${profileState.error}` : 'PROFILE_PROBE nominal',
    sessionState.error ? `SESSION_INDEX ${sessionState.error}` : 'REMOTE_FS auth bridge sealed'
  ])

  onMount(() => {
    void refreshActiveProfile()
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

  function connectionToneClass(tone: DashboardConnectionTone): string {
    if (tone === 'good') return 'border-success/45 bg-success/10 text-success'
    if (tone === 'busy') return 'border-secondary/45 bg-secondary/10 text-secondary'
    if (tone === 'bad') return 'border-danger/55 bg-danger/10 text-danger'
    return 'border-line-strong bg-surface-raised/70 text-ink-muted'
  }

  function pipClass(index: number, active: number): string {
    if (index >= active) return 'bg-surface-raised'
    if (index > 16) return 'bg-danger'
    if (index > 12) return 'bg-warning'
    return 'bg-secondary'
  }

  function utilityStateClass(state: DashboardUtilityState): string {
    if (state === 'ready') return 'border-primary/45 text-primary hover:border-primary hover:bg-primary/10'
    return 'border-line text-ink-muted'
  }

  function sessionStatusClass(status: 'active' | 'idle'): string {
    return status === 'active' ? 'text-success' : 'text-ink-muted'
  }
</script>

<section
  class="h-full min-h-0 overflow-y-auto bg-canvas p-4 font-mono text-[12px] text-ink"
  aria-label="Main dashboard"
>
  <div class="grid h-full min-h-0 grid-rows-[50px_minmax(0,1fr)_40px] gap-5">
    <header class="flex items-center justify-between border-b border-line pb-2">
      <div class="flex items-center gap-4">
        <div class="text-[1.2em] font-bold tracking-[0.22em] text-warning">BITCH_OS</div>
        <div class="border border-line px-2 py-0.5 text-[0.7em] uppercase tracking-[0.18em] text-ink-muted">
          main.sysmon
        </div>
      </div>
      <div class="text-right">
        <div class={`inline-flex border px-2 py-0.5 text-[1.2em] font-bold ${connectionToneClass(connection.tone)}`}>
          {connection.label}
        </div>
        <div class="mt-1 text-[0.7em] uppercase tracking-[0.16em] text-ink-muted">
          UPTIME <span class="text-ink">{uptimeLabel}</span>
        </div>
      </div>
    </header>

    <div class="grid min-h-0 gap-5 xl:grid-cols-[22%_1fr_28%]">
      <section class="flex min-h-0 flex-col gap-5">
        <Panel
          fullHeight={false}
          title="HARDWARE_GEO"
          class="flex-[3] border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="flex flex-col gap-3"
          titleClass="text-ink-muted"
        >
          <div class="relative flex min-h-[11rem] flex-1 items-center justify-center overflow-hidden border border-line/70 bg-surface-raised">
            <div class="absolute left-3 top-3 text-[0.7em] uppercase tracking-[0.16em] text-ink-muted">// RENDER_MESH</div>
            <div class="absolute inset-0 bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-[size:22px_22px] opacity-30"></div>
            <div class="relative text-center font-mono text-[1.2rem] font-bold leading-[1.05] tracking-[0.22em] text-primary drop-shadow-[0_0_18px_var(--color-primary)]">
              {#each meshLines as line}
                <div>{line}</div>
              {/each}
            </div>
          </div>
          <div class="border-t border-dashed border-line pt-3 text-[0.8em]">
            <div class="mb-1 flex justify-between gap-3">
              <span class="text-ink-muted">CPU_MODEL</span>
              <span class="truncate text-warning">{activeProfile?.provider ?? 'LINK_V4'}</span>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-ink-muted">ACTIVE_PROFILES</span>
              <span class="text-primary">{profileCount}</span>
            </div>
            <div class="mt-2 flex justify-between gap-3">
              <span class="text-ink-muted">CONNECTION_TARGET</span>
              <span class="truncate text-right text-ink">{connection.target}</span>
            </div>
            <div class="mt-1 flex justify-between gap-3">
              <span class="text-ink-muted">ACTIVE_PROFILE</span>
              <span class="truncate text-right text-primary">{connection.profile}</span>
            </div>
            <div class="mt-1 flex justify-between gap-3">
              <span class="text-ink-muted">DASHBOARD_PROFILE</span>
              <span class="truncate text-right text-success">{profileState.activeProfile}</span>
            </div>
            {#if visibleProfiles.length}
              <div class="mt-3 grid gap-1 border-t border-dashed border-line pt-2" aria-label="Known profiles">
                {#each visibleProfiles as profile (profile.name)}
                  <div class="flex justify-between gap-2 text-[0.72em]">
                    <span class="truncate text-ink">{profile.name}</span>
                    <span class="shrink-0 text-ink-muted">{profile.has_env ? 'env' : 'no env'}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </Panel>

        <Panel fullHeight={false} title="RADAR_SCAN" class="flex-[2] border-line bg-surface transition-colors hover:border-line-strong" titleClass="text-ink-muted">
          <div class="relative h-full min-h-[10rem] overflow-hidden rounded-control border border-line/70 bg-surface-raised">
            <div class="absolute inset-6 rounded-full border border-primary/20"></div>
            <div class="absolute inset-12 rounded-full border border-primary/15"></div>
            <div class="absolute left-1/2 top-4 h-[calc(100%-2rem)] w-px -translate-x-1/2 bg-line"></div>
            <div class="absolute left-4 top-1/2 h-px w-[calc(100%-2rem)] -translate-y-1/2 bg-line"></div>
            <div class="absolute left-1/2 top-1/2 h-[42%] w-px origin-bottom -translate-x-1/2 -translate-y-full rotate-45 bg-success/55"></div>
            <div class="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"></div>
            <div class="absolute inset-4 grid grid-cols-2 content-between text-[0.65em] uppercase tracking-[0.14em] text-ink-muted">
              {#each radarAxes as axis}
                <span>{axis}</span>
              {/each}
            </div>
          </div>
        </Panel>
      </section>

      <section class="flex min-h-0 flex-col gap-5">
        <Panel
          fullHeight={false}
          title="PROCESSING"
          badge={`${cpuTemp}°C`}
          class="border-line bg-surface transition-colors hover:border-line-strong"
          contentClass="space-y-1.5"
          titleClass="text-ink-muted"
        >
          {#each processingRows as core}
            <div class="flex items-center gap-2">
              <div class="w-9 text-[0.8em] text-ink-muted">{core.label}</div>
              <div class="flex h-2.5 flex-1 gap-0.5 rounded-sm bg-input">
                {#each pipSlots as pip}
                  <span class={`h-full flex-1 ${pipClass(pip, core.active)}`}></span>
                {/each}
              </div>
            </div>
          {/each}
        </Panel>

        <Panel fullHeight={false} title="SIGNAL_WAVEFORM" class="flex-1 border-line bg-surface transition-colors hover:border-line-strong" titleClass="text-ink-muted">
          <div class="flex h-full items-center justify-center">
            <div class="flex w-full items-center justify-between border border-line/70 bg-primary/5 p-3">
              <div>
                <span class="text-[1.4em] font-bold text-primary">{frameMs}</span>
                <span class="ml-2 text-[0.7em] uppercase tracking-[0.18em] text-secondary">FRAME_MS</span>
              </div>
              <div class="text-right text-[0.65em] uppercase tracking-[0.14em] text-ink-muted">TARGET: 16.67MS</div>
            </div>
          </div>
        </Panel>

        <div class="grid h-[112px] gap-5 sm:grid-cols-2">
          <Panel fullHeight={false} title="PERFORMANCE" class="border-line bg-surface transition-colors hover:border-line-strong" contentClass="flex flex-col gap-2" titleClass="text-ink-muted">
            <div class="flex items-center justify-between text-[0.75em] uppercase tracking-[0.12em]">
              <span class="text-ink-muted/70">FPS TARGET: 60</span>
              <span class="text-[1.3em] font-bold text-primary">{connection.tone === 'good' ? 60 : 30}</span>
            </div>
            <div class="flex min-h-0 flex-1 items-end gap-px border border-line/70 bg-surface-raised p-1">
              {#each fpsBars as bar}
                <span
                  class="w-full bg-primary opacity-80"
                  style={`height: ${20 + ((bar * 13 + powerLevel) % 76)}%; background-color: ${bar % 9 === 0 && connection.tone === 'bad' ? 'var(--color-danger)' : 'var(--color-primary)'}`}
                ></span>
              {/each}
            </div>
          </Panel>

          <Panel fullHeight={false} title="PWR_CELL" class="border-line bg-surface transition-colors hover:border-line-strong" titleClass="text-ink-muted">
            <div class="flex h-full flex-col justify-center text-center">
              <div class="text-[1.8em] font-bold leading-none text-success">{powerLevel}%</div>
              <div class="mt-3 h-1 overflow-hidden rounded-full bg-line/70">
                <div class="h-full bg-success" style={`width: ${powerLevel}%`}></div>
              </div>
            </div>
          </Panel>
        </div>

        <Panel fullHeight={false} title="UTILITY_SURFACES" class="flex-[1.1] border-line bg-surface transition-colors hover:border-line-strong" contentClass="grid grid-cols-5 gap-2" titleClass="text-ink-muted">
          {#each quickLinks as link (link.id)}
            {#if link.href}
              <a
                class={`border bg-surface-raised p-2 text-[0.75em] uppercase tracking-[0.12em] transition ${utilityStateClass(link.state)}`}
                href={link.href}
              >
                <span class="block text-[0.72em] text-ink-muted">{link.state}</span>
                <span class="mt-1 block font-bold text-ink">{link.label}</span>
                <span class="sr-only">{link.description}</span>
              </a>
            {:else}
              <div
                class={`border bg-surface-raised p-2 text-[0.75em] uppercase tracking-[0.12em] ${utilityStateClass(link.state)}`}
                role="link"
                aria-disabled="true"
                tabindex="-1"
              >
                <span class="block text-[0.72em] text-ink-muted">{link.state}</span>
                <span class="mt-1 block font-bold text-ink">{link.label}</span>
                <span class="sr-only">{link.description}</span>
              </div>
            {/if}
          {/each}
        </Panel>
      </section>

      <section class="flex min-h-0 flex-col gap-5">
        <Panel fullHeight={false} title="TASKS" class="flex-[2] border-line bg-surface transition-colors hover:border-line-strong" contentClass="overflow-hidden" titleClass="text-ink-muted">
          {#if taskRows.length}
            <table class="w-full table-fixed border-collapse text-[0.85em]">
              <thead>
                <tr class="border-b border-line text-left text-ink-muted">
                  <th class="py-1 pr-2 font-bold">USER</th>
                  <th class="w-16 py-1 pr-2 font-bold">CPU</th>
                  <th class="py-1 font-bold">CMD</th>
                </tr>
              </thead>
              <tbody>
                {#each taskRows as row}
                  <tr>
                    <td class="truncate py-1.5 pr-2 text-warning">{row.profile}</td>
                    <td class={`py-1.5 pr-2 ${sessionStatusClass(row.status)}`}>{row.cpu}</td>
                    <td class="truncate py-1.5 text-primary">
                      {row.cmd} <span class="text-ink-muted/70">[{row.pid}]</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <div class="flex h-full items-center justify-center border border-dashed border-line p-5 text-center text-ink-muted">
              {sessionState.sessionsLoading ? 'Syncing session process table…' : 'No recent sessions in the selected remote profile scope.'}
            </div>
          {/if}
        </Panel>

        <Panel fullHeight={false} title="KERNEL_LOG" class="flex-1 border-line bg-surface transition-colors hover:border-line-strong" contentClass="flex flex-col-reverse gap-1 overflow-hidden" titleClass="text-danger">
          {#each logRows as row, index}
            <div class={`text-[0.8em] leading-5 ${index === 0 ? 'text-primary' : index > 2 ? 'text-danger' : 'text-ink-muted/80'}`}>
              <span class="mr-2 text-ink-muted">[{String(index).padStart(2, '0')}]</span>{row}
            </div>
          {/each}
        </Panel>
      </section>
    </div>

    <footer class="flex items-center justify-between border-t border-line pt-2 text-[0.8em] uppercase tracking-[0.16em] text-ink-muted">
      <div class="text-secondary">MODE: <span class="font-bold text-ink">REMOTE_ACCESS</span></div>
      <div class="text-danger">LOCAL BOOTSTRAP: <span class="text-ink">DISABLED</span></div>
    </footer>
  </div>
</section>
