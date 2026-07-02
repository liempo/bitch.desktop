<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import MarketplaceThemeBrowser from './MarketplaceThemeBrowser.svelte'
  import { installedThemeOptions, selectTheme, themeOptions, themeState, uninstallImportedTheme } from '$lib/theme'
  import { NOTIFICATION_PREFERENCE_ITEMS, loadNotificationPreferences, setNotificationPreference } from '$lib/platform/notifications'

  let themeImportStatus = $state('')
  let themePickerOpen = $state(false)
  let notificationPreferences = $state(loadNotificationPreferences())

  function installedThemes() {
    return installedThemeOptions()
  }

  function handleThemeChange(event: Event): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLSelectElement)) return

    selectTheme(target.value)
  }

  function handleNotificationPreferenceChange(
    category: (typeof NOTIFICATION_PREFERENCE_ITEMS)[number]['category'],
    event: Event
  ): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLInputElement)) return

    notificationPreferences = setNotificationPreference(category, target.checked)
  }

  function handleUninstallTheme(themeId: string): void {
    const themeName = themeOptions.find(theme => theme.id === themeId)?.source.name ?? 'theme'
    uninstallImportedTheme(themeId)
    themeImportStatus = `Uninstalled ${themeName}.`
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-chat-scroll/40 p-2 sm:p-3 md:p-4" aria-label="Settings">
  <div class="mx-auto grid w-full max-w-4xl min-w-0 gap-3 pb-8 sm:gap-4">
    <div class="rounded-panel border border-line bg-surface p-3 sm:p-4">
      <p class="font-hud text-[0.62rem] font-bold uppercase tracking-[0.2em] text-primary">Settings</p>
      <h1 class="mt-2 font-hud text-base font-bold uppercase tracking-[0.12em] text-ink-bright sm:text-lg">Control surface</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
        Configure local BITCH desktop preferences without crowding the primary navigation bar.
      </p>
    </div>

    <Panel title="Appearance" fullHeight={false} contentClass="space-y-3 sm:space-y-4">
      <div class="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center">
        <div>
          <label for="settings-theme" class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
            Theme
          </label>
          <p class="mt-1 text-xs leading-5 text-ink-muted">
            Select the active terminal palette for panels, menus, focus rings, and glyph details.
          </p>
        </div>

        <select
          id="settings-theme"
          aria-label="Theme"
          bind:value={themeState.selectedThemeId}
          class="w-full min-w-0 rounded-control border border-line bg-input px-3 py-2 font-hud text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted outline-none hover:border-line-strong hover:text-ink-bright focus:border-focus focus:outline-2 focus:outline-focus focus:outline-offset-0 sm:text-[11px]"
          onchange={handleThemeChange}
        >
          {#each themeOptions as theme (theme.id)}
            <option value={theme.id}>{theme.source.name}</option>
          {/each}
        </select>
      </div>

      <div class="grid min-w-0 gap-3 rounded-panel border border-line bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center">
        <div>
          <p class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
            VS Code theme picker
          </p>
          <p class="mt-1 text-xs leading-5 text-ink-muted">
            Install Marketplace color-theme extensions and manage installed themes in a dedicated picker dialog.
          </p>
          {#if themeImportStatus}
            <p class="mt-2 text-xs leading-5 text-primary" role="status">{themeImportStatus}</p>
          {/if}
        </div>

        <Button
          variant="primary"
          class="w-full whitespace-normal py-2 !leading-tight"
          onclick={() => (themePickerOpen = true)}
          aria-haspopup="dialog"
          aria-expanded={themePickerOpen}
        >
          Open VS Code theme picker
        </Button>
      </div>
    </Panel>

    <Panel title="Notifications" fullHeight={false} contentClass="space-y-3 sm:space-y-4">
      <div>
        <p class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
          Desktop notification categories
        </p>
        <p class="mt-1 text-xs leading-5 text-ink-muted">
          Choose which background events can ask macOS for attention. Click payloads still route through the platform adapter.
        </p>
      </div>

      <div class="grid gap-2">
        {#each NOTIFICATION_PREFERENCE_ITEMS as { category, description, label } (category)}
          <label class="grid min-w-0 cursor-pointer gap-3 rounded-panel border border-line bg-surface-muted p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 accent-primary"
              checked={notificationPreferences[category]}
              onchange={event => handleNotificationPreferenceChange(category, event)}
            />
            <span class="min-w-0">
              <span class="block font-hud text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ink-bright">{label}</span>
              <span class="mt-1 block text-xs leading-5 text-ink-muted">{description}</span>
            </span>
          </label>
        {/each}
      </div>
    </Panel>
  </div>

  <Dialog
    bind:open={themePickerOpen}
    title="VS Code Theme Picker"
    description="install Marketplace color-theme packages and uninstall installed themes"
    class="!bottom-2 !left-2 !right-2 !top-2 !w-auto !max-h-[calc(100dvh-1rem)] !translate-x-0 !translate-y-0 sm:!bottom-auto sm:!left-1/2 sm:!right-auto sm:!top-1/2 sm:!w-[min(56rem,calc(100vw-2rem))] sm:!-translate-x-1/2 sm:!-translate-y-1/2"
    contentClass="p-0"
  >
    <div class="grid max-h-[calc(100dvh-5rem)] min-h-0 gap-3 overflow-y-auto overscroll-contain p-2 sm:max-h-[min(44rem,calc(100vh-8rem))] sm:p-3">
      <div class="grid gap-3 rounded-panel border border-line bg-surface-muted p-3">
        <div>
          <p class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
            Installed themes/extensions
          </p>
          <p class="mt-1 text-xs leading-5 text-ink-muted">
            Loaded Marketplace themes are stored locally. Uninstalling a selected theme returns the app to the default BITCH
            palette.
          </p>
          {#if themeImportStatus}
            <p class="mt-2 text-xs leading-5 text-primary" role="status">{themeImportStatus}</p>
          {/if}
        </div>

        {#if installedThemes().length > 0}
          <div class="grid gap-2" role="list" aria-label="Installed VS Code themes and extensions">
            {#each installedThemes() as theme (theme.id)}
              <article class="grid min-w-0 gap-3 rounded-panel border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto]" role="listitem">
                <div class="min-w-0">
                  <h3 class="break-words font-hud text-[0.74rem] font-bold uppercase tracking-[0.14em] text-ink-bright sm:truncate">
                    {theme.source.name}
                  </h3>
                  <p class="mt-1 break-all text-xs text-ink-muted sm:truncate">{theme.id}</p>
                </div>

                <Button variant="secondary" class="w-full self-start sm:w-auto" onclick={() => handleUninstallTheme(theme.id)}>Uninstall</Button>
              </article>
            {/each}
          </div>
        {:else}
          <p class="rounded-control border border-line bg-input px-3 py-2 text-xs leading-5 text-ink-muted">
            No Marketplace themes installed yet. Search below and install one when the catalogue behaves.
          </p>
        {/if}
      </div>

      <MarketplaceThemeBrowser />
    </div>
  </Dialog>
</section>
