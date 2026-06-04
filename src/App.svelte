<script lang="ts">
  import { onMount } from 'svelte'
  import AppShell from './app/AppShell.svelte'
  import { connectGateway, disconnectGateway } from '$lib/stores/gateway.svelte'

  onMount(() => {
    void connectGateway()

    return () => {
      disconnectGateway()
    }
  })
</script>

<AppShell />
