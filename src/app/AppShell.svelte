<script lang="ts">
  import type { Component } from 'svelte'

  import StartupSplash from './components/StartupSplash.svelte'
  import AppNavbar from './navigation/AppNavbar.svelte'
  import { appRouterState, type AppPage } from './router.svelte'

  type PageModule = { default: Component }

  const pageLoaders = {
    agent: () => import('./agent/AgentShell.svelte'),
    assets: () => import('./assets/AssetsPage.svelte'),
    calendar: () => import('./calendar/CalendarPage.svelte'),
    cron: () => import('./cron/CronPage.svelte'),
    kanban: () => import('./kanban/KanbanPage.svelte'),
    main: () => import('./main/MainPage.svelte')
  } satisfies Record<AppPage, () => Promise<PageModule>>

  const pageComponentCache = new Map<AppPage, Promise<PageModule>>()
  const pageComponentPromise = $derived(loadPageComponent(appRouterState.page))

  function loadPageComponent(page: AppPage): Promise<PageModule> {
    const cached = pageComponentCache.get(page)
    if (cached) return cached

    const promise = pageLoaders[page]()
    pageComponentCache.set(page, promise)
    return promise
  }

  function routeLoadErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
</script>

<div class="h-full" data-theme="cyberpunk">
  <div class="relative isolate flex h-full w-full flex-col overflow-hidden bg-chat-scroll">
    <AppNavbar />

    <main class="relative z-10 min-h-0 flex-1 overflow-hidden">
      {#await pageComponentPromise}
        <div class="grid h-full place-items-center p-4 font-hud text-xs uppercase tracking-[0.18em] text-ink-muted" role="status">
          Loading {appRouterState.page}
        </div>
      {:then module}
        {@const PageComponent = module.default}
        <PageComponent />
      {:catch error}
        <div class="m-4 rounded-panel border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">
          Failed to load {appRouterState.page}: {routeLoadErrorMessage(error)}
        </div>
      {/await}
    </main>

    <StartupSplash />
  </div>
</div>
