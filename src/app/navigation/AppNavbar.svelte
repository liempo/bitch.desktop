<script lang="ts">
  import { Popover } from 'bits-ui'

  import Icon from '@/app/components/ui/Icon.svelte'
  import { menuItemClass, popoverClass } from '@/app/components/ui/styles'
  import {
    agentRoute,
    appRouterState,
    assetsRoute,
    calendarRoute,
    cronRoute,
    kanbanRoute,
    mainRoute,
    settingsRoute,
    type AppPage
  } from '../router.svelte'
  import { sessionState } from '$lib/hermes/sessions'

  interface NavItem {
    href: string
    label: string
    page: AppPage
  }

  let mobileMenuOpen = $state(false)

  const navItems = $derived<NavItem[]>([
    { href: `#${agentRoute(sessionState.storedSessionId)}`, label: 'AGENT', page: 'agent' },
    { href: `#${assetsRoute()}`, label: 'ASSETS', page: 'assets' },
    { href: `#${calendarRoute()}`, label: 'CALENDAR', page: 'calendar' },
    { href: `#${cronRoute()}`, label: 'CRON', page: 'cron' },
    { href: `#${kanbanRoute()}`, label: 'KANBAN', page: 'kanban' }
  ])
  const settingsNavItem = $derived<NavItem>({ href: `#${settingsRoute()}`, label: 'SETTINGS', page: 'settings' })
  const mobileMenuItems = $derived<NavItem[]>([...navItems, settingsNavItem])

  const settingsDesktopControlClass = 'inline-flex items-center leading-none'
  const settingsMobileControlClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
  const mobileMenuContentClass = `${popoverClass} z-50 min-w-52 p-1.5 font-mono shadow-xl`
  const mobileMenuItemBaseClass = `${menuItemClass} flex w-full justify-between px-3 py-2 text-left font-hud text-[11px] font-bold uppercase tracking-[0.14em]`

  function linkClass(page: AppPage): string {
    const base =
      'font-hud text-[11px] font-bold uppercase tracking-[0.18em] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'

    if (appRouterState.page === page) {
      return `${base} text-primary`
    }

    return `${base} text-ink-muted hover:text-ink-bright`
  }

  function mobileLinkClass(page: AppPage): string {
    return `${mobileMenuItemBaseClass} ${appRouterState.page === page ? 'border-primary/40 bg-primary/10 text-primary' : 'text-ink-muted'}`
  }

  function closeMobileMenu(): void {
    mobileMenuOpen = false
  }
</script>

<nav
  class="relative z-20 flex min-h-(--bits-navbar-height) shrink-0 items-center border-b border-line bg-canvas px-3 md:px-4"
  aria-label="Primary navigation"
>
  <div class="flex min-w-0 items-center gap-3 pl-2 md:pl-18.5">
    <div class="ml-2 hidden h-4 w-px bg-line-strong/70 md:block" data-tauri-drag-region></div>
    <a
      class={`${linkClass('main')} inline-flex items-center gap-2`}
      href={`#${mainRoute()}`}
      aria-current={appRouterState.page === 'main' ? 'page' : undefined}
    >
      <span>BITCH</span>
    </a>
  </div>

  <div class="min-w-4 flex-1 self-stretch" data-tauri-drag-region></div>

  <div class="hidden items-center gap-6 md:flex">
    {#each navItems as item (item.page)}
      <a class={linkClass(item.page)} href={item.href} aria-current={appRouterState.page === item.page ? 'page' : undefined}>
        {item.label}
      </a>
    {/each}
    <a
      class={`${linkClass('settings')} ${settingsDesktopControlClass}`}
      href={`#${settingsRoute()}`}
      aria-label="Open settings"
      aria-current={appRouterState.page === 'settings' ? 'page' : undefined}
      title={settingsNavItem.label}
    >
      <Icon name="settings" class="text-[12px] leading-none" />
      <span class="sr-only">{settingsNavItem.label}</span>
    </a>
  </div>

  <div class="flex items-center gap-2 md:hidden">
    <Popover.Root bind:open={mobileMenuOpen}>
      <Popover.Trigger
        class="inline-flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        aria-label="Open navigation menu"
        aria-expanded={mobileMenuOpen}
      >
        <Icon name="menu" class="text-lg" />
      </Popover.Trigger>

      <Popover.Content class={mobileMenuContentClass} sideOffset={6} align="end">
        <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          navigation
        </div>
        <div class="grid gap-1">
          <a
            class={mobileLinkClass('main')}
            href={`#${mainRoute()}`}
            aria-current={appRouterState.page === 'main' ? 'page' : undefined}
            onclick={closeMobileMenu}
          >
            <span>MAIN</span>
            {#if appRouterState.page === 'main'}
              <span class="text-[10px] text-primary">active</span>
            {/if}
          </a>
          {#each mobileMenuItems as item (item.page)}
            <a
              class={mobileLinkClass(item.page)}
              href={item.href}
              aria-current={appRouterState.page === item.page ? 'page' : undefined}
              onclick={closeMobileMenu}
            >
              <span>{item.label}</span>
              {#if appRouterState.page === item.page}
                <span class="text-[10px] text-primary">active</span>
              {/if}
            </a>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>

    <a
      class={settingsMobileControlClass}
      href={`#${settingsRoute()}`}
      aria-label="Open settings"
      aria-current={appRouterState.page === 'settings' ? 'page' : undefined}
      title={settingsNavItem.label}
    >
      <Icon name="settings" class="text-lg" />
      <span class="sr-only">{settingsNavItem.label}</span>
    </a>
  </div>
</nav>
