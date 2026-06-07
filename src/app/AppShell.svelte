<script lang="ts">
  import Composer from './composer/Composer.svelte'
  import ApprovalBar from './prompts/ApprovalBar.svelte'
  import SecretModal from './prompts/SecretModal.svelte'
  import SudoModal from './prompts/SudoModal.svelte'
  import Sidebar from './sidebar/Sidebar.svelte'
  import Thread from './thread/Thread.svelte'
  import { routerState } from './router.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { layoutState } from '$lib/stores/layout.svelte'
  import { resumeAndHydrateStoredSession } from '$lib/session/resume'
  import { startMessageStream, stopMessageStream } from '$lib/stores/messages.svelte'
  import { initializeSessions, setActiveSession, startNewSession } from '$lib/stores/session.svelte'

  let lastResumedSessionId: string | null = null
  const connectionState = $derived(gatewayState.connectionState)
  const sidebarOpen = $derived(layoutState.sidebarOpen)
  const selectedSessionId = $derived(routerState.route === 'session' ? routerState.sessionId : null)

  $effect(() => {
    if (connectionState === 'open') {
      void initializeSessions()
    }
  })

  $effect(() => {
    if (connectionState !== 'open') return

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

<div class="flex h-full w-full">
  <!-- ===== Sidebar ===== -->
  {#if sidebarOpen}
    <Sidebar />
  {/if}

  <!-- ===== Main column ===== -->
  <div class="flex flex-1 flex-col">
    <!-- -- Content area -- -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <Thread sessionId={selectedSessionId} canCreate={connectionState === 'open'} onCreate={startNewSession} />
    </div>

    <!-- -- Composer shelf -- -->
    <ApprovalBar sessionId={selectedSessionId} />
    <Composer sessionId={selectedSessionId} connected={connectionState === 'open'} />
  </div>
</div>

<SudoModal />
<SecretModal />
