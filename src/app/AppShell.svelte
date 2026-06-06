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
  import { resumeAndHydrateStoredSession } from '$lib/session/resume'
  import { startMessageStream, stopMessageStream } from '$lib/stores/messages.svelte'
  import { createSession, initializeSessions, setActiveSession } from '$lib/stores/session.svelte'

  let lastResumedSessionId: string | null = null
  const connectionState = $derived(gatewayState.connectionState)
  const connectionDetail = $derived(gatewayState.connectionDetail)
  const sidebarOpen = $derived(layoutState.sidebarOpen)
  const selectedSessionId = $derived(routerState.route === 'session' ? routerState.sessionId : null)

  const statusColor: Record<string, string> = {
    idle: 'bg-slate-500',
    connecting: 'bg-amber-500',
    open: 'bg-emerald-500',
    closed: 'bg-slate-500',
    error: 'bg-red-500'
  }

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
    <!-- -- Top bar -- -->
    <header class="flex h-11 items-center justify-between border-b border-slate-800 px-4">
      <div class="flex items-center gap-3">
        <!-- Connection indicator -->
        <span
          class="inline-block h-2 w-2 rounded-full {statusColor[connectionState] ?? 'bg-slate-500'}"
        ></span>
        <span class="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
          {connectionState}
        </span>
        {#if connectionState === 'error' || connectionState === 'connecting'}
          <span class="max-w-80 truncate text-xs text-slate-500">{connectionDetail}</span>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <!-- Sidebar toggle -->
        <button
          class="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          onclick={toggleSidebar}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              d={sidebarOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
            /></svg>
        </button>
      </div>
    </header>

    <!-- -- Content area -- -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <Thread sessionId={selectedSessionId} canCreate={connectionState === 'open'} onCreate={createSession} />
    </div>

    <!-- -- Composer shelf -- -->
    <ApprovalBar sessionId={selectedSessionId} />
    <Composer sessionId={selectedSessionId} connected={connectionState === 'open'} />
  </div>
</div>

<SudoModal />
<SecretModal />
