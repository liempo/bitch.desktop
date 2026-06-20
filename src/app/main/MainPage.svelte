<script lang="ts">
  import { onMount } from 'svelte'

  import Glyph from '@/components/ui/Glyph.svelte'
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
  const recentSessions = $derived(recentDashboardSessions(sessionState.sessions, 5))
  const activeProfile = $derived(
    profileState.profiles.find(profile => profile.name === profileState.activeGatewayProfile) ?? null
  )
  const visibleProfiles = $derived(profileState.profiles.slice(0, 4))

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
    if (tone === 'good') return 'border-success/40 bg-success/10 text-success'
    if (tone === 'busy') return 'border-warning/45 bg-warning/10 text-warning'
    if (tone === 'bad') return 'border-danger/45 bg-danger/10 text-danger'
    return 'border-line-strong bg-surface-raised/45 text-ink-muted'
  }

  function utilityStateClass(state: DashboardUtilityState): string {
    if (state === 'ready') return 'border-primary/35 bg-primary/8 text-primary hover:border-primary/70 hover:bg-primary/15'
    return 'border-line bg-surface-raised/35 text-ink-muted'
  }

  function sessionStatusClass(status: 'active' | 'idle'): string {
    return status === 'active' ? 'bg-success/15 text-success' : 'bg-surface-raised text-ink-muted'
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-chat-scroll/55 p-4 sm:p-6" aria-label="Main dashboard">
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-5">
    <header class="rounded-panel border border-line bg-canvas/82 p-5 shadow-panel">
      <div class="flex items-start justify-between gap-4">
        <p class="font-hud text-[11px] font-bold uppercase tracking-[0.24em] text-primary">MAIN</p>
        <Glyph class="hidden opacity-80 sm:inline-flex" label="Main dashboard signal glyph" />
      </div>
      <div class="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold uppercase tracking-[0.12em] text-ink-bright">Operations dashboard</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
            Remote Hermes health, active profile context, recent thread telemetry, and the utility surfaces that are
            safe to expose from the desktop shell. No local bootstrap chrome, no back-alley file servers. We are trying
            civilization today.
          </p>
        </div>

        <div class={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 font-hud text-[11px] font-bold uppercase tracking-[0.18em] ${connectionToneClass(connection.tone)}`}>
          <span class="h-2 w-2 rounded-full bg-current"></span>
          {connection.label}
        </div>
      </div>
    </header>

    <div class="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section class="rounded-panel border border-line bg-canvas/78 p-5 shadow-panel" aria-labelledby="dashboard-health-title">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Gateway</p>
            <h2 id="dashboard-health-title" class="mt-2 text-lg font-semibold uppercase tracking-[0.12em] text-ink-bright">
              Dashboard health
            </h2>
          </div>
          <span class={`rounded-full border px-3 py-1 font-hud text-[10px] uppercase tracking-[0.16em] ${connectionToneClass(connection.tone)}`}>
            {connection.label}
          </span>
        </div>

        <dl class="mt-5 grid gap-3 text-sm">
          <div class="rounded-control border border-line bg-surface-raised/35 p-3">
            <dt class="font-hud text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">Connection target</dt>
            <dd class="mt-1 break-all font-mono text-[0.8rem] text-ink-bright">{connection.target}</dd>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-control border border-line bg-surface-raised/35 p-3">
              <dt class="font-hud text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">Active profile</dt>
              <dd class="mt-1 text-ink-bright">{connection.profile}</dd>
            </div>
            <div class="rounded-control border border-line bg-surface-raised/35 p-3">
              <dt class="font-hud text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">Dashboard profile</dt>
              <dd class="mt-1 text-ink-bright">{profileState.activeProfile}</dd>
            </div>
          </div>
          <div class="rounded-control border border-line bg-surface-raised/35 p-3">
            <dt class="font-hud text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">Gateway detail</dt>
            <dd class="mt-1 text-sm leading-6 text-ink-muted">{connection.detail}</dd>
          </div>
        </dl>

        {#if profileState.error}
          <p class="mt-4 rounded-control border border-danger/35 bg-danger/10 p-3 text-sm text-danger">
            Profile probe failed: {profileState.error}
          </p>
        {/if}
      </section>

      <section class="rounded-panel border border-line bg-canvas/78 p-5 shadow-panel" aria-labelledby="dashboard-profile-title">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Profile state</p>
            <h2 id="dashboard-profile-title" class="mt-2 text-lg font-semibold uppercase tracking-[0.12em] text-ink-bright">
              Active operator context
            </h2>
          </div>
          <span class="rounded-full border border-line bg-surface-raised/45 px-3 py-1 font-hud text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            {profileState.profiles.length || 0} profiles
          </span>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="rounded-control border border-line bg-surface-raised/35 p-3">
            <p class="font-hud text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">Provider</p>
            <p class="mt-1 text-ink-bright">{activeProfile?.provider ?? 'Unknown'}</p>
          </div>
          <div class="rounded-control border border-line bg-surface-raised/35 p-3">
            <p class="font-hud text-[10px] font-bold uppercase tracking-[0.18em] text-ink-faint">Model</p>
            <p class="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-ink-bright">{activeProfile?.model ?? 'Not reported'}</p>
          </div>
        </div>

        {#if visibleProfiles.length}
          <div class="mt-4 space-y-2" aria-label="Known profiles">
            {#each visibleProfiles as profile (profile.name)}
              <div class="flex items-center justify-between gap-3 rounded-control border border-line bg-surface-raised/30 px-3 py-2">
                <div class="min-w-0">
                  <p class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-ink-bright">{profile.name}</p>
                  <p class="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-ink-faint">{profile.path}</p>
                </div>
                <span class="shrink-0 rounded-full bg-surface-raised px-2 py-1 font-hud text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                  {profile.has_env ? 'env' : 'no env'}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mt-4 rounded-control border border-dashed border-line p-4 text-sm text-ink-muted">
            {profileState.loading ? 'Syncing profile index…' : 'No profile inventory reported yet.'}
          </p>
        {/if}
      </section>
    </div>

    <section class="rounded-panel border border-line bg-canvas/78 p-5 shadow-panel" aria-labelledby="dashboard-utilities-title">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Utility surfaces</p>
          <h2 id="dashboard-utilities-title" class="mt-2 text-lg font-semibold uppercase tracking-[0.12em] text-ink-bright">
            Fast routes
          </h2>
        </div>
        <p class="text-xs text-ink-faint">Ready cards navigate inside BITCH; planned cards are visible without spoofing unfinished routes.</p>
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {#each quickLinks as link (link.id)}
          {#if link.href}
            <a class={`rounded-panel border p-4 transition ${utilityStateClass(link.state)}`} href={link.href}>
              <span class="font-hud text-[10px] font-bold uppercase tracking-[0.18em]">{link.state}</span>
              <span class="mt-3 block text-lg font-semibold text-ink-bright">{link.label}</span>
              <span class="mt-2 block text-xs leading-5 text-ink-muted">{link.description}</span>
            </a>
          {:else}
            <div class={`rounded-panel border p-4 ${utilityStateClass(link.state)}`} role="link" aria-disabled="true" tabindex="-1">
              <span class="font-hud text-[10px] font-bold uppercase tracking-[0.18em]">{link.state}</span>
              <span class="mt-3 block text-lg font-semibold text-ink-bright">{link.label}</span>
              <span class="mt-2 block text-xs leading-5 text-ink-muted">{link.description}</span>
            </div>
          {/if}
        {/each}
      </div>
    </section>

    <section class="rounded-panel border border-line bg-canvas/78 p-5 shadow-panel" aria-labelledby="dashboard-sessions-title">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="font-hud text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Threads</p>
          <h2 id="dashboard-sessions-title" class="mt-2 text-lg font-semibold uppercase tracking-[0.12em] text-ink-bright">
            Recent sessions
          </h2>
        </div>
        <span class="font-hud text-[10px] uppercase tracking-[0.16em] text-ink-faint">{sessionState.sessionsTotal} indexed</span>
      </div>

      {#if sessionState.error}
        <p class="mt-5 rounded-control border border-danger/35 bg-danger/10 p-3 text-sm text-danger">
          Session index failed: {sessionState.error}
        </p>
      {:else if recentSessions.length}
        <div class="mt-5 grid gap-3 lg:grid-cols-2">
          {#each recentSessions as session (session.id)}
            <a class="rounded-panel border border-line bg-surface-raised/35 p-4 transition hover:border-primary/55 hover:bg-primary/8" href={session.href}>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-ink-bright">{session.title}</p>
                  <p class="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-ink-faint">{session.id}</p>
                </div>
                <span class={`shrink-0 rounded-full px-2 py-1 font-hud text-[10px] uppercase tracking-[0.14em] ${sessionStatusClass(session.status)}`}>
                  {session.status}
                </span>
              </div>
              <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                <span>Profile: {session.profile}</span>
                <span>Last active: {session.lastActiveLabel}</span>
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <p class="mt-5 rounded-control border border-dashed border-line p-5 text-sm text-ink-muted">
          {sessionState.sessionsLoading ? 'Syncing session index…' : 'No recent sessions in the selected remote profile scope.'}
        </p>
      {/if}
    </section>
  </div>
</section>
