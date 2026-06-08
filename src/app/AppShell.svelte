<script lang="ts">
  import Composer from './composer/Composer.svelte'
  import ApprovalBar from './prompts/ApprovalBar.svelte'
  import SecretModal from './prompts/SecretModal.svelte'
  import SudoModal from './prompts/SudoModal.svelte'
  import Sidebar from './sidebar/Sidebar.svelte'
  import Thread from './thread/Thread.svelte'
  import { routerState } from './router.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { layoutState, toggleSidebar } from '$lib/stores/layout.svelte'
  import { getProfileScope, profileState } from '$lib/stores/profile.svelte'
  import { resumeAndHydrateStoredSession } from '$lib/session/resume'
  import { startMessageStream, stopMessageStream } from '$lib/stores/messages.svelte'
  import { initializeSessions, loadSessions, sessionState, setActiveSession, startNewSession } from '$lib/stores/session.svelte'

  let lastResumedSessionId: string | null = null
  let lastFreshSessionRequest = profileState.freshSessionRequest
  let lastLoadedScope: string | null = null
  const connectionState = $derived(gatewayState.connectionState)
  const activeGatewayProfile = $derived(gatewayState.activeProfile)
  const sidebarOpen = $derived(layoutState.sidebarOpen)
  const selectedSessionId = $derived(routerState.route === 'session' ? routerState.sessionId : null)
  const selectedSession = $derived(selectedSessionId ? (sessionState.sessions.find(session => session.id === selectedSessionId) ?? null) : null)
  const chatTitle = $derived(selectedSession?.title?.trim() || (selectedSessionId ? 'Untitled session' : 'New session'))
  const chatMeta = $derived.by(() => {
    if (!selectedSessionId) return 'Ready for a new Hermes session'
    if (!selectedSession) return 'Loading session info'

    return [selectedSession.model, `${selectedSession.message_count} msg`, selectedSession.cwd ?? selectedSession.source]
      .filter(Boolean)
      .join(' / ') || 'Session metadata unavailable'
  })

  $effect(() => {
    if (connectionState === 'open') {
      void initializeSessions()
    }
  })

  $effect(() => {
    if (connectionState !== 'open') return

    const scope = getProfileScope()
    if (scope !== lastLoadedScope) {
      lastLoadedScope = scope
      void loadSessions(0)
    }
  })

  $effect(() => {
    const request = profileState.freshSessionRequest
    if (request !== lastFreshSessionRequest) {
      lastFreshSessionRequest = request
      lastResumedSessionId = null
      startNewSession()
    }
  })

  $effect(() => {
    if (connectionState !== 'open') return

    const profile = activeGatewayProfile
    if (!profile) return

    startMessageStream()

    return () => stopMessageStream()
  })

  async function resumeAndHydrate(sessionId: string): Promise<boolean> {
    // Route/session selection is keyed by the persistent stored id. The shared
    // helper mirrors upstream Desktop: fetch the stored snapshot first, resume
    // the live runtime second, and ignore stale completions when the route has
    // already moved on.
    return resumeAndHydrateStoredSession(sessionId)
  }

  $effect(() => {
    if (connectionState !== 'open') return

    if (routerState.route === 'new') {
      lastResumedSessionId = null
      setActiveSession(null)
      return
    }

    if (routerState.sessionId && routerState.sessionId !== lastResumedSessionId) {
      const requestedSessionId = routerState.sessionId
      lastResumedSessionId = requestedSessionId
      void resumeAndHydrate(requestedSessionId).then(applied => {
        if (!applied && routerState.sessionId === requestedSessionId) {
          lastResumedSessionId = null
        }
      })
    }
  })
</script>

<div class="h-full" data-theme="cyberpunk">
  <div class="cli-shell flex flex-col">
    <div class="cli-window-bar flex shrink-0 items-start justify-between pl-[82px] pr-2 pt-[10px]" data-tauri-drag-region>
      <div class="flex items-center gap-1" data-tauri-drag-region>
        <button
          class="bitch-button bitch-button-borderless min-h-0 shrink-0 p-0 text-primary hover:text-ink-bright"
          type="button"
          onclick={toggleSidebar}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </button>
      </div>

      <div class="flex-1" data-tauri-drag-region></div>
      <div class="w-8" data-tauri-drag-region></div>
    </div>

    <div class="cli-frame flex flex-col md:flex-row">
      <!-- ===== Sidebar ===== -->
      {#if sidebarOpen}
        <Sidebar />
      {/if}

      <!-- ===== Main terminal ===== -->
      <main class="cli-panel cli-panel-flat relative flex min-w-0 flex-1 flex-col overflow-hidden border-0" aria-label="BITCH terminal workspace">
        <header class="cli-topbar flex shrink-0 items-center justify-between gap-3 px-4 py-2">
          <div class="min-w-0">
            <h1 class="truncate text-sm font-semibold tracking-[0.08em] text-ink-bright">{chatTitle}</h1>
            <p class="mt-0.5 truncate text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">{chatMeta}</p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <span class="cli-status-pill" title="Active gateway profile">
              PROFILE::{activeGatewayProfile}
            </span>
          </div>
        </header>

        {#if profileState.gatewaySwapTarget}
          <div class="pointer-events-none absolute inset-x-4 top-16 z-20 border border-primary/35 bg-canvas/90 px-4 py-2 text-xs uppercase tracking-[0.14em] text-primary shadow-lg shadow-black/30 backdrop-blur">
            HANDSHAKE::{profileState.gatewaySwapTarget} PROFILE
          </div>
        {/if}

        <!-- -- Content area -- -->
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Thread sessionId={selectedSessionId} />
        </div>

        <!-- -- Composer shelf -- -->
        <ApprovalBar sessionId={selectedSessionId} />
        <Composer sessionId={selectedSessionId} connected={connectionState === 'open'} />
      </main>
    </div>
  </div>

  <SudoModal />
  <SecretModal />
</div>
