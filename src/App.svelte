<script lang="ts">
  import { onMount } from 'svelte'
  import AppShell from './app/AppShell.svelte'
  import { agentRoute } from './app/router.svelte'
  import { installCustomScrollbars, SPLASH_REMOVE_AFTER_MS, STARTUP_SPLASH_COMPLETE_EVENT } from '$lib/layout'
  import { installMacosNotificationClickHandler, openExternalUrl } from '$lib/platform'
  import { connectGateway, disconnectGateway } from '$lib/hermes/gateway'
  import { startMessageStream, stopMessageStream } from '$lib/hermes/conversations'
  import { refreshActiveProfile } from '$lib/hermes/profiles'

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

    let customScrollbarsInstalled = false
    let uninstallCustomScrollbars: () => void = () => undefined
    let uninstallNotificationClickHandler: () => void = () => undefined

    function installScrollbars(): void {
      if (customScrollbarsInstalled) return

      customScrollbarsInstalled = true
      uninstallCustomScrollbars = installCustomScrollbars()
    }

    const scrollbarFallbackTimer = window.setTimeout(installScrollbars, SPLASH_REMOVE_AFTER_MS + 100)

    window.addEventListener('contextmenu', handleContextMenu)
    window.addEventListener('click', handleClick)
    window.addEventListener(STARTUP_SPLASH_COMPLETE_EVENT, installScrollbars, { once: true })
    startMessageStream()

    void installMacosNotificationClickHandler(sessionId => {
      window.location.hash = agentRoute(sessionId)
    })
      .then(unlisten => {
        uninstallNotificationClickHandler = unlisten
      })
      .catch(error => {
        console.warn('Failed to install macOS notification click handler', error)
      })

    void (async () => {
      await connectGateway()
      await refreshActiveProfile()
    })()

    return () => {
      window.clearTimeout(scrollbarFallbackTimer)
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('click', handleClick)
      window.removeEventListener(STARTUP_SPLASH_COMPLETE_EVENT, installScrollbars)
      uninstallCustomScrollbars()
      uninstallNotificationClickHandler()
      stopMessageStream()
      disconnectGateway()
    }
  })
</script>

<AppShell />
