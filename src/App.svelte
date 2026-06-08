<script lang="ts">
  import { onMount } from 'svelte'
  import AppShell from './app/AppShell.svelte'
  import { connectGateway, disconnectGateway } from '$lib/stores/gateway.svelte'
  import { refreshActiveProfile } from '$lib/stores/profile.svelte'

  onMount(() => {
    void (async () => {
      await connectGateway()
      await refreshActiveProfile()
    })()

    return () => {
      disconnectGateway()
    }
  })
</script>

<AppShell />
