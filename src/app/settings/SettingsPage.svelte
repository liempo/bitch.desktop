<script lang="ts">
  import Panel from '@/app/components/ui/Panel.svelte'
  import { selectTheme, themeOptions, themeState } from '$lib/theme'

  function handleThemeChange(event: Event): void {
    const target = event.currentTarget
    if (!(target instanceof HTMLSelectElement)) return

    selectTheme(target.value)
  }
</script>

<section class="h-full min-h-0 overflow-y-auto bg-chat-scroll/40 p-3 md:p-4" aria-label="Settings">
  <div class="mx-auto grid w-full max-w-4xl gap-4 pb-8">
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
    </Panel>
  </div>
</section>
