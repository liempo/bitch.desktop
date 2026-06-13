<script lang="ts">
  import Composer from './composer/Composer.svelte'
  import SecretModal from './prompts/SecretModal.svelte'
  import SudoModal from './prompts/SudoModal.svelte'
  import Sidebar from './sidebar/Sidebar.svelte'
  import Thread from './thread/Thread.svelte'
  import { routerState } from './router.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { layoutState, toggleSidebar } from '$lib/stores/layout.svelte'
  import { getProfileScope, profileState } from '$lib/stores/profile.svelte'
  import { resumeAndHydrateStoredSession } from '$lib/session/resume'
  import { initializeSessions, loadSessions, sessionState, setActiveSession, startNewSession } from '$lib/stores/session.svelte'

  let lastResumedSessionId: string | null = null
  let lastFreshSessionRequest = profileState.freshSessionRequest
  let lastLoadedScope: string | null = null
  const connectionState = $derived(gatewayState.connectionState)
  const activeGatewayProfile = $derived(gatewayState.activeProfile)
  const sidebarOpen = $derived(layoutState.sidebarOpen)
  const selectedSessionId = $derived(routerState.route === 'session' ? routerState.sessionId : null)
  const selectedSession = $derived(selectedSessionId ? (sessionState.sessions.find(session => session.id === selectedSessionId) ?? null) : null)
  const selectedSessionProfile = $derived(
    selectedSessionId ? (selectedSession?.profile ?? sessionState.sessionProfilesById[selectedSessionId] ?? null) : null
  )
  const composerProfileName = $derived(selectedSessionProfile ?? profileState.newChatProfile ?? activeGatewayProfile)
  const chatTitle = $derived(selectedSession?.title?.trim() || (selectedSessionId ? 'Untitled session' : 'New session'))

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

<div class="flex h-full min-h-0 flex-col py-4">
  <div class="flex min-h-0 w-full flex-1 flex-col gap-0 p-0 md:flex-row">
    <!-- ===== Sidebar ===== -->
    {#if sidebarOpen}
      <Sidebar />
    {/if}

    <!-- ===== Main terminal ===== -->
    <main class="relative flex min-w-0 flex-1 flex-col overflow-hidden border-0 bg-transparent" aria-label="BITCH terminal workspace">
      {#if profileState.gatewaySwapTarget}
        <div class="pointer-events-none absolute inset-x-4 top-4 z-20 border border-primary/35 bg-canvas px-4 py-2 text-xs uppercase tracking-[0.14em] text-primary">
          HANDSHAKE::{profileState.gatewaySwapTarget} PROFILE
        </div>
      {/if}

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Thread sessionId={selectedSessionId} />
      </div>

      <Composer
        sessionId={selectedSessionId}
        connected={connectionState === 'open'}
        sessionTitle={chatTitle}
        profileName={composerProfileName}
        {sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
    </main>
  </div>

  <SudoModal />
  <SecretModal />
</div>
