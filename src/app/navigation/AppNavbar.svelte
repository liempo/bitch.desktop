<script lang="ts">
  import Icon from '@/app/components/ui/Icon.svelte'
  import { agentRoute, appRouterState, assetsRoute, calendarRoute, cronRoute, kanbanRoute, mainRoute, type AppPage } from '../router.svelte'
  import { sessionState } from '$lib/hermes/sessions'
  import { selectTheme, themeOptions, themeState, type NerdIconName } from '$lib/theme'

  interface NavItem {
    href: string
    icon: NerdIconName
    label: string
    page: AppPage
  }

  const navItems = $derived<NavItem[]>([
    { href: `#${agentRoute(sessionState.storedSessionId)}`, icon: 'agent', label: 'AGENT', page: 'agent' },
    { href: `#${assetsRoute()}`, icon: 'assets', label: 'ASSETS', page: 'assets' },
    { href: `#${calendarRoute()}`, icon: 'calendar', label: 'CALENDAR', page: 'calendar' },
    { href: `#${cronRoute()}`, icon: 'cron', label: 'CRON', page: 'cron' },
    { href: `#${kanbanRoute()}`, icon: 'kanban', label: 'KANBAN', page: 'kanban' }
  ])

  function linkClass(page: AppPage): string {
    const base =
      'font-hud text-[11px] font-bold uppercase tracking-[0.18em] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'

    if (appRouterState.page === page) {
      return `${base} text-primary`
    }

    return `${base} text-ink-muted hover:text-ink-bright`
  }

  function handleThemeChange(event: Event): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLSelectElement)) return

    selectTheme(target.value)
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
      <Icon name="home" class="text-[0.95em]" />
      <span>BITCH</span>
    </a>
  </div>

  <div class="min-w-4 flex-1 self-stretch" data-tauri-drag-region></div>

  <div class="flex items-center gap-6 pr-2">
    {#each navItems as item (item.page)}
      <a
        class={`${linkClass(item.page)} inline-flex items-center gap-1.5`}
        href={item.href}
        aria-current={appRouterState.page === item.page ? 'page' : undefined}
      >
        <Icon name={item.icon} class="text-[0.95em]" />
        <span>{item.label}</span>
      </a>
    {/each}

    <select
      aria-label="Theme"
      bind:value={themeState.selectedThemeId}
      class="rounded-control border border-line bg-input px-2 py-1 font-hud text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted outline-none hover:border-line-strong hover:text-ink-bright focus:border-focus focus:outline-2 focus:outline-focus focus:outline-offset-0"
      onchange={handleThemeChange}
    >
      {#each themeOptions as theme (theme.id)}
        <option value={theme.id}>{theme.source.name}</option>
      {/each}
    </select>
  </div>
</nav>
