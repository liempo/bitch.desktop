<script lang="ts">
  import { onMount } from 'svelte'
  import AppShell from './app/AppShell.svelte'
  import { openExternalUrl } from '$lib/platform'
  import { installCustomScrollbars } from '$lib/ui/custom-scrollbars'
  import { connectGateway, disconnectGateway } from '$lib/stores/gateway.svelte'
  import { startMessageStream, stopMessageStream } from '$lib/stores/messages.svelte'
  import { refreshActiveProfile } from '$lib/stores/profile.svelte'

  onMount(() => {
    function handleContextMenu(event: MouseEvent): void {
      event.preventDefault()
    }

    function handleClick(event: MouseEvent): void {
      const target = event.target
      if (!(target instanceof Element)) return

      const link = target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return

      const url = new URL(link.href)
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === window.location.origin) return

      event.preventDefault()
      void openExternalUrl(url.toString()).catch(error => {
        console.error('Failed to open external URL', error)
      })
    }

    window.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('click', handleClick)
    const uninstallCustomScrollbars = installCustomScrollbars()
    startMessageStream()

    void (async () => {
      await connectGateway()
      await refreshActiveProfile()
    })()

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('click', handleClick)
      uninstallCustomScrollbars()
      stopMessageStream()
      disconnectGateway()
    }
  })
</script>

<AppShell />
