<script lang="ts">
  import Panel from '@/app/components/ui/Panel.svelte'
  import MarketplaceThemeBrowser from './MarketplaceThemeBrowser.svelte'
  import { importAndUseVsCodeExtensionThemes, selectTheme, themeOptions, themeState } from '$lib/theme'

  let themeImportStatus = $state('')

  function handleThemeChange(event: Event): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLSelectElement)) return

    selectTheme(target.value)
  }

  async function handleVsCodeThemeBrowse(event: Event): Promise<void> {
    const target = event.currentTarget
    if (!(target instanceof HTMLInputElement) || !target.files?.length) return

    const result = await importAndUseVsCodeExtensionThemes(target.files)
    themeImportStatus = result.themes.length
      ? `Imported ${result.themes.length} VS Code theme${result.themes.length === 1 ? '' : 's'} from extension files.`
      : 'No VS Code color themes found. Select an unpacked extension folder or a theme JSON file.'

    if (result.errors.length > 0) {
      themeImportStatus = `${themeImportStatus} ${result.errors.length} file${result.errors.length === 1 ? '' : 's'} could not be read.`
    }

    target.value = ''
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-chat-scroll/40 p-3 md:p-4" aria-label="Settings">
  <div class="mx-auto grid w-full max-w-4xl gap-4 pb-8">
    <div class="rounded-panel border border-line bg-canvas/80 p-4">
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

      <div class="grid gap-2 rounded-panel border border-line/70 bg-surface/70 p-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] md:items-center">
        <div>
          <p class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
            VS Code extension themes
          </p>
          <p class="mt-1 text-xs leading-5 text-ink-muted">
            Browse an unpacked VS Code extension folder or select a color-theme JSON file. Imported themes are stored locally
            and can be used immediately from the theme selector.
          </p>
          {#if themeImportStatus}
            <p class="mt-2 text-xs leading-5 text-primary" role="status">{themeImportStatus}</p>
          {/if}
        </div>

        <div class="grid gap-2">
          <label
            for="settings-vscode-extension-theme-folder"
            class="cursor-pointer rounded-control border border-line bg-input px-3 py-2 text-center font-hud text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted hover:border-line-strong hover:text-ink-bright focus-within:border-focus focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-0"
          >
            Browse extension folder
          </label>
          <input
            id="settings-vscode-extension-theme-folder"
            class="sr-only"
            type="file"
            multiple
            webkitdirectory
            aria-label="Browse VS Code extension theme folder"
            onchange={handleVsCodeThemeBrowse}
          />

          <label
            for="settings-vscode-theme-json"
            class="cursor-pointer rounded-control border border-line bg-input px-3 py-2 text-center font-hud text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted hover:border-line-strong hover:text-ink-bright focus-within:border-focus focus-within:outline-2 focus-within:outline-focus focus-within:outline-offset-0"
          >
            Browse theme JSON
          </label>
          <input
            id="settings-vscode-theme-json"
            class="sr-only"
            type="file"
            accept=".json,application/json"
            multiple
            aria-label="Browse VS Code theme JSON"
            onchange={handleVsCodeThemeBrowse}
          />
        </div>
      </div>

      <MarketplaceThemeBrowser />
    </Panel>
  </div>
</section>
