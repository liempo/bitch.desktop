<script lang="ts">
  import { Button } from 'bits-ui'
  import { onMount } from 'svelte'
  import { HermesGateway } from './lib/hermes'
  import {
    consumeLastTauriGatewaySocketError,
    listenToTauriGatewaySocketLogs,
    type GatewaySocketLog
  } from './lib/tauri-gateway-socket'

  type UiGatewayLog = GatewaySocketLog & { at: string }

  const gateway = new HermesGateway()
  let statusText = $state('idle')
  let detail = $state('Waiting…')
  let logs = $state<UiGatewayLog[]>([])

  function appendLog(log: GatewaySocketLog): void {
    logs = [
      ...logs,
      {
        ...log,
        at: new Date().toLocaleTimeString()
      }
    ].slice(-80)
  }

  function appendRendererLog(level: string, message: string): void {
    appendLog({ connectionId: 'renderer', level, message })
  }

  function clearLogs(): void {
    logs = []
  }

  function detailedError(error: unknown): string {
    const base = error instanceof Error ? error.message : String(error)
    const bridgeError = consumeLastTauriGatewaySocketError()

    if (bridgeError && bridgeError !== base) {
      return `${base}: ${bridgeError}`
    }

    return base
  }

  onMount(() => {
    const baseUrl = import.meta.env.VITE_BITCH_GATEWAY_URL ?? 'http://127.0.0.1:9119'
    let cancelled = false
    let unlistenLogs: (() => void) | undefined
    const unsubscribe = gateway.onState(state => {
      statusText = state
      appendRendererLog('debug', `gateway state -> ${state}`)
    })

    void (async () => {
      try {
        unlistenLogs = await listenToTauriGatewaySocketLogs(log => {
          if (cancelled) {
            return
          }

          appendLog(log)

          if (log.level === 'error') {
            detail = log.message
          }
        })

        if (cancelled) {
          unlistenLogs()
          return
        }

        detail = `Connecting to Hermes dashboard at ${baseUrl}`
        appendRendererLog('info', detail)
        await gateway.connect(baseUrl)
        detail = 'Dashboard gateway transport ready'
        appendRendererLog('info', detail)
      } catch (error) {
        const message = detailedError(error)
        detail = message
        appendRendererLog('error', message)
      }
    })()

    return () => {
      cancelled = true
      unlistenLogs?.()
      unsubscribe()
      gateway.close()
    }
  })
</script>

<main class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-6 py-10">
  <section class="grid gap-3 rounded-3xl border border-slate-800/80 bg-slate-900/70 p-8 text-center shadow-2xl shadow-black/20 backdrop-blur">
    <p class="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300/80">Hermes gateway</p>
    <h1 class="text-3xl font-semibold tracking-tight text-slate-50">BITCH Desktop</h1>
    <p class="text-sm uppercase tracking-[0.25em] text-slate-400">{statusText}</p>
    <p class="mx-auto max-w-2xl text-base text-slate-300">{detail}</p>

    <div class="flex justify-center pt-2">
      <Button.Root
        class="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
        onclick={clearLogs}
        disabled={!logs.length}
      >
        Clear logs
      </Button.Root>
    </div>
  </section>

  {#if logs.length}
    <section
      class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 shadow-xl shadow-black/20 backdrop-blur"
      aria-label="Gateway connection logs"
    >
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-slate-100">Gateway connection log</h2>
        <span class="text-sm text-slate-400">{logs.length} entries</span>
      </div>

      <ol class="space-y-3">
        {#each logs as log}
          <li
            class={`grid gap-2 rounded-2xl border p-4 text-left shadow-sm ${
              log.level === 'error'
                ? 'border-rose-500/30 bg-rose-500/10'
                : log.level === 'warn'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-slate-800 bg-slate-900/70'
            }`}
            data-level={log.level}
          >
            <div class="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-400">
              <time>{log.at}</time>
              <strong class="rounded-full border border-slate-700 px-2 py-1 text-[0.7rem] font-semibold text-slate-200">
                {log.level}
              </strong>
              <span class="break-all text-slate-500">{log.connectionId}</span>
            </div>
            <span class="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-slate-200">
              {log.message}
            </span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</main>
