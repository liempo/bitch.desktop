<script lang="ts">
  import { Button } from 'bits-ui'
  import Composer from './composer/Composer.svelte'
  import Sidebar from './sidebar/Sidebar.svelte'
  import Thread from './thread/Thread.svelte'
  import { routerState } from './router.svelte'
  import { clearLogs, gatewayState } from '$lib/stores/gateway.svelte'
  import { layoutState, toggleSidebar } from '$lib/stores/layout.svelte'
  import {
    hydrateSessionMessages,
    hydrateSessionMessagesFromGateway,
    startMessageStream,
    stopMessageStream
  } from '$lib/stores/messages.svelte'
  import { createSession, initializeSessions, resumeSession, setActiveSession } from '$lib/stores/session.svelte'

  let devPanelOpen = $state(false)
  let lastResumedSessionId: string | null = null
  const connectionState = $derived(gatewayState.connectionState)
  const connectionDetail = $derived(gatewayState.connectionDetail)
  const logs = $derived(gatewayState.logs)
  const sidebarOpen = $derived(layoutState.sidebarOpen)

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

  async function resumeAndHydrate(sessionId: string): Promise<void> {
    const response = await resumeSession(sessionId)

    if (response?.messages) {
      hydrateSessionMessagesFromGateway(sessionId, response.messages)
    } else {
      await hydrateSessionMessages(sessionId)
    }
  }

  $effect(() => {
    if (connectionState !== 'open') return

    if (routerState.route === 'new') {
      lastResumedSessionId = null
      setActiveSession(null)
      return
    }

    if (routerState.sessionId && routerState.sessionId !== lastResumedSessionId) {
      lastResumedSessionId = routerState.sessionId
      void resumeAndHydrate(routerState.sessionId)
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
        <!-- Dev panel toggle -->
        <Button.Root
          class="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          onclick={() => (devPanelOpen = !devPanelOpen)}
        >
          {devPanelOpen ? 'Hide log' : 'Debug'}
        </Button.Root>

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
      <Thread
        sessionId={routerState.route === 'session' ? routerState.sessionId : null}
        canCreate={connectionState === 'open'}
        onCreate={createSession}
      />
    </div>

    <!-- -- Composer shelf -- -->
    <Composer sessionId={routerState.route === 'session' ? routerState.sessionId : null} connected={connectionState === 'open'} />
  </div>
</div>

<!-- ===== Collapsible dev panel (old connectivity log) ===== -->
{#if devPanelOpen}
  <aside class="flex w-105 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-950/80 p-4">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Gateway log
      </h2>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-600">{logs.length} entries</span>
        <Button.Root
          class="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          onclick={clearLogs}
          disabled={logs.length === 0}
        >
          Clear
        </Button.Root>
      </div>
    </div>

    <ol class="space-y-2">
      {#each logs as log (log.at + log.message)}
        <li
          class={`rounded-xl border p-3 text-xs shadow-sm ${
            log.level === 'error'
              ? 'border-rose-500/30 bg-rose-500/10'
              : log.level === 'warn'
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-slate-800 bg-slate-900/70'
          }`}
        >
          <div class="mb-1 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
            <time>{log.at}</time>
            <span class="rounded-full border border-slate-700 px-1.5 py-0.5 font-semibold text-slate-400">
              {log.level}
            </span>
            <span class="truncate text-slate-600">{log.connectionId}</span>
          </div>
          <p class="whitespace-pre-wrap wrap-break-word leading-5 text-slate-300">{log.message}</p>
        </li>
      {/each}
    </ol>
  </aside>
{/if}
