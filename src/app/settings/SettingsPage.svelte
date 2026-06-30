<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import MarketplaceThemeBrowser from './MarketplaceThemeBrowser.svelte'
  import { installedThemeOptions, selectTheme, themeOptions, themeState, uninstallImportedTheme } from '$lib/theme'

  let themeImportStatus = $state('')
  let themePickerOpen = $state(false)

  function installedThemes() {
    return installedThemeOptions()
  }

  function handleThemeChange(event: Event): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLSelectElement)) return

    selectTheme(target.value)
  }

  function handleUninstallTheme(themeId: string): void {
    const themeName = themeOptions.find(theme => theme.id === themeId)?.source.name ?? 'theme'
    uninstallImportedTheme(themeId)
    themeImportStatus = `Uninstalled ${themeName}.`
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-chat-scroll/40 p-3 md:p-4" aria-label="Settings">
  <div class="mx-auto grid w-full max-w-4xl gap-4 pb-8">
    <div class="rounded-panel border border-line bg-surface p-4">
      <p class="font-hud text-[0.62rem] font-bold uppercase tracking-[0.2em] text-primary">Settings</p>
      <h1 class="mt-2 font-hud text-lg font-bold uppercase tracking-[0.12em] text-ink-bright">Control surface</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
        Configure local BITCH desktop preferences without crowding the primary navigation bar.
      </p>
    </div>

    <Panel title="Appearance" fullHeight={false} contentClass="space-y-4">
      <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] md:items-center">
        <div>
          <label for="settings-theme" class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
            Theme
          </label>
          <p class="mt-1 text-xs leading-5 text-ink-muted">
            Select the active terminal palette for panels, menus, focus rings, and glyph chrome.
          </p>
        </div>

        <select
          id="settings-theme"
          aria-label="Theme"
          bind:value={themeState.selectedThemeId}
          class="w-full rounded-control border border-line bg-input px-3 py-2 font-hud text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted outline-none hover:border-line-strong hover:text-ink-bright focus:border-focus focus:outline-2 focus:outline-focus focus:outline-offset-0"
          onchange={handleThemeChange}
        >
          {#each themeOptions as theme (theme.id)}
            <option value={theme.id}>{theme.source.name}</option>
          {/each}
        </select>
      </div>

      <div class="grid gap-3 rounded-panel border border-line bg-surface-muted p-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] md:items-center">
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

        <Button variant="primary" class="w-full" onclick={() => (themePickerOpen = true)} aria-haspopup="dialog" aria-expanded={themePickerOpen}>
          Open VS Code theme picker
        </Button>
      </div>
    </Panel>
  </div>

  <Dialog
    bind:open={themePickerOpen}
    title="VS Code Theme Picker"
    description="install Marketplace color-theme packages and uninstall installed themes"
    class="!w-[min(56rem,calc(100vw-2rem))]"
    contentClass="p-0"
  >
    <div class="grid max-h-[min(44rem,calc(100vh-8rem))] gap-3 overflow-y-auto p-3">
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
              <article class="grid gap-3 rounded-panel border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto]" role="listitem">
                <div class="min-w-0">
                  <h3 class="truncate font-hud text-[0.74rem] font-bold uppercase tracking-[0.14em] text-ink-bright">
                    {theme.source.name}
                  </h3>
                  <p class="mt-1 truncate text-xs text-ink-muted">{theme.id}</p>
                </div>

                <Button variant="secondary" class="self-start" onclick={() => handleUninstallTheme(theme.id)}>Uninstall</Button>
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
