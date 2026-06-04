<script lang="ts">
  import { onMount } from 'svelte'
  import { HermesGateway } from './lib/hermes'

  const gateway = new HermesGateway()
  let statusText = $state('idle')
  let detail = $state('Waiting…')

  onMount(() => {
    const wsUrl = import.meta.env.VITE_BITCH_GATEWAY_WS_URL ?? 'ws://127.0.0.1:9119/api/ws'
    const unsubscribe = gateway.onState(state => {
      statusText = state
    })

    void (async () => {
      try {
        detail = `Connecting to ${wsUrl}`
        await gateway.connect(wsUrl)
        detail = 'Transport layer ready'
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error)
      }
    })()

    return () => {
      unsubscribe()
      gateway.close()
    }
  })
</script>

<main data-state={statusText}>
  <h1>BITCH Desktop</h1>
  <p class="state">{statusText}</p>
  <p class="detail">{detail}</p>
</main>
