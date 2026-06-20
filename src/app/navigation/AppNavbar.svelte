<script lang="ts">
  import bitchLogoUrl from '$lib/assets/bitch-logo.png'
  import { agentRoute, appRouterState, assetsRoute, calendarRoute, kanbanRoute, mainRoute, type AppPage } from '../router.svelte'
  import { sessionState } from '$lib/stores/session.svelte'

  interface NavItem {
    href: string
    label: string
    page: AppPage
  }

  const navItems = $derived<NavItem[]>([
    { href: `#${agentRoute(sessionState.storedSessionId)}`, label: 'AGENT', page: 'agent' },
    { href: `#${assetsRoute()}`, label: 'ASSETS', page: 'assets' },
    { href: `#${calendarRoute()}`, label: 'CALENDAR', page: 'calendar' },
    { href: `#${kanbanRoute()}`, label: 'KANBAN', page: 'kanban' }
  ])

  function linkClass(page: AppPage): string {
    const base =
      'font-hud text-[11px] font-bold uppercase tracking-[0.18em] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'

    if (appRouterState.page === page) {
      return `${base} text-primary`
    }

    return `${base} text-ink-muted hover:text-ink-bright`
  }
</script>

<nav
  class="relative z-20 flex min-h-(--bits-navbar-height) shrink-0 items-center border-b border-line bg-canvas px-4"
  aria-label="Primary navigation"
>
  <div class="flex min-w-0 items-center gap-3 pl-18.5">
    <div class="ml-2 hidden h-4 w-px bg-line-strong/70 md:block" data-tauri-drag-region></div>
    <a
      class={`${linkClass('main')} inline-flex items-center gap-2`}
      href={`#${mainRoute()}`}
      aria-current={appRouterState.page === 'main' ? 'page' : undefined}
    >
      <img class="h-5 w-5 rounded-sm bg-black" src={bitchLogoUrl} alt="" aria-hidden="true" />
      <span>BITCH</span>
    </a>
  </div>

  <div class="min-w-4 flex-1 self-stretch" data-tauri-drag-region></div>

  <div class="flex items-center gap-6 pr-2">
    {#each navItems as item (item.page)}
      <a class={linkClass(item.page)} href={item.href} aria-current={appRouterState.page === item.page ? 'page' : undefined}>
        {item.label}
      </a>
    {/each}
  </div>
</nav>
