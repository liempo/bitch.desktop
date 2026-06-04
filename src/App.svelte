<script lang="ts">
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

<main data-state={statusText}>
  <h1>BITCH Desktop</h1>
  <p class="state">{statusText}</p>
  <p class="detail">{detail}</p>

  {#if logs.length}
    <section class="logs" aria-label="Gateway connection logs">
      <h2>Gateway connection log</h2>
      <ol>
        {#each logs as log}
          <li data-level={log.level}>
            <time>{log.at}</time>
            <strong>{log.level}</strong>
            <span>{log.message}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</main>
