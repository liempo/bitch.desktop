<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import { openExternalUrl } from '$lib/platform'
  import {
    importAndUseVsCodeMarketplaceThemeExtension,
    searchVsCodeMarketplaceThemes,
    themeState,
    type VsCodeMarketplaceThemeExtension
  } from '$lib/theme'

  let marketplaceQuery = $state('')
  let marketplaceStatus = $state('Search the live Visual Studio Marketplace theme category without leaving the desktop shell.')
  let marketplaceError = $state('')
  let marketplaceLoading = $state(false)
  let installingExtensionId = $state<string | undefined>()
  let marketplaceExtensions = $state<VsCodeMarketplaceThemeExtension[]>([])

  async function handleMarketplaceThemeSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    await loadMarketplaceThemes()
  }

  async function loadMarketplaceThemes(): Promise<void> {
    marketplaceLoading = true
    marketplaceError = ''
    marketplaceStatus = 'Querying the real VS Code Marketplace theme category…'

    try {
      const result = await searchVsCodeMarketplaceThemes({ query: marketplaceQuery, pageSize: 12 })
      marketplaceExtensions = result.extensions
      marketplaceStatus = result.extensions.length
        ? `Showing ${result.extensions.length} color-theme extension${result.extensions.length === 1 ? '' : 's'} from ${result.scanned} Marketplace theme-category match${result.scanned === 1 ? '' : 'es'} scanned.`
        : `No color-theme extensions found in ${result.scanned} Marketplace theme-category match${result.scanned === 1 ? '' : 'es'} scanned.`
    } catch (error) {
      marketplaceExtensions = []
      marketplaceError = error instanceof Error ? error.message : String(error)
      marketplaceStatus = 'Marketplace query failed. The chrome coughed politely and produced nothing useful.'
    } finally {
      marketplaceLoading = false
    }
  }

  async function openMarketplaceExtension(extension: VsCodeMarketplaceThemeExtension): Promise<void> {
    marketplaceError = ''

    try {
      await openExternalUrl(extension.marketplaceUrl)
    } catch (error) {
      marketplaceError = error instanceof Error ? error.message : String(error)
    }
  }

  async function installMarketplaceExtension(extension: VsCodeMarketplaceThemeExtension): Promise<void> {
    marketplaceError = ''
    installingExtensionId = extension.extensionId
    marketplaceStatus = `Downloading ${extension.displayName} from Marketplace and extracting VS Code color themes…`

    try {
      const result = await importAndUseVsCodeMarketplaceThemeExtension(extension)
      marketplaceStatus = result.themes.length
        ? `Installed ${result.themes.length} theme${result.themes.length === 1 ? '' : 's'} from ${extension.displayName}; applied ${themeState.selectedTheme.source.name}.`
        : `${extension.displayName} did not contain installable color themes.`

      if (result.errors.length > 0) {
        marketplaceStatus = `${marketplaceStatus} ${result.errors.length} file${result.errors.length === 1 ? '' : 's'} could not be read.`
      }
    } catch (error) {
      marketplaceError = error instanceof Error ? error.message : String(error)
      marketplaceStatus = `Install failed for ${extension.displayName}. The package elevator stopped between floors.`
    } finally {
      installingExtensionId = undefined
    }
  }

  function formatCount(value?: number): string {
    if (value === undefined) return '—'
    return new Intl.NumberFormat(undefined, { notation: value >= 100000 ? 'compact' : 'standard' }).format(value)
  }

  function formatRating(extension: VsCodeMarketplaceThemeExtension): string {
    if (extension.averageRating === undefined) return 'unrated'
    const rating = extension.averageRating.toFixed(1)
    const count = formatCount(extension.ratingCount)
    return `${rating} ★ (${count})`
  }

  function themeLabels(extension: VsCodeMarketplaceThemeExtension): string {
    const labels = extension.themes.slice(0, 3).map(theme => theme.label)
    const suffix = extension.themes.length > labels.length ? ` +${extension.themes.length - labels.length}` : ''
    return `${labels.join(', ')}${suffix}`
  }
</script>

<div class="grid gap-3 rounded-panel border border-line bg-surface-muted p-3">
  <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-end">
    <div>
      <p class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-bright">
        VS Code Marketplace themes
      </p>
      <p class="mt-1 text-xs leading-5 text-ink-muted">
        Browse the actual Visual Studio Marketplace, locked to the VS Code <span class="font-bold text-ink-bright">Themes</span>
        category, filtered to extensions that publish color-theme contributions, then install the VSIX theme payload directly into the
        local theme selector. Icon packs can wait outside in the rain.
      </p>
    </div>

    <form class="grid gap-2" onsubmit={handleMarketplaceThemeSubmit}>
      <label for="settings-marketplace-theme-query" class="sr-only">Search Marketplace themes</label>
      <input
        id="settings-marketplace-theme-query"
        bind:value={marketplaceQuery}
        type="search"
        autocomplete="off"
        placeholder="Search themes, e.g. dracula"
        class="w-full rounded-control border border-line bg-input px-3 py-2 font-hud text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted outline-none placeholder:text-ink-muted/55 hover:border-line-strong hover:text-ink-bright focus:border-focus focus:outline-2 focus:outline-focus focus:outline-offset-0"
      />
      <Button
        type="submit"
        disabled={marketplaceLoading}
        class="w-full disabled:cursor-wait"
      >
        {marketplaceLoading ? 'Scanning marketplace…' : marketplaceQuery.trim() ? 'Search theme marketplace' : 'Load popular marketplace themes'}
      </Button>
    </form>
  </div>

  <p class="text-xs leading-5 text-primary" role="status">{marketplaceStatus}</p>
  {#if marketplaceError}
    <p class="rounded-control border border-danger/50 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger" role="alert">
      {marketplaceError}
    </p>
  {/if}

  {#if marketplaceExtensions.length > 0}
    <div class="grid gap-2" role="list" aria-label="VS Code Marketplace theme extensions">
      {#each marketplaceExtensions as extension (extension.extensionId)}
        <article class="grid gap-3 rounded-panel border border-line bg-surface p-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]" role="listitem">
          <div class="h-10 w-10 overflow-hidden rounded-control border border-line bg-input">
            {#if extension.iconUrl}
              <img src={extension.iconUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
            {:else}
              <div class="grid h-full w-full place-items-center font-hud text-[0.62rem] font-bold text-primary">VS</div>
            {/if}
          </div>

          <div class="min-w-0">
            <h3 class="truncate font-hud text-[0.74rem] font-bold uppercase tracking-[0.14em] text-ink-bright">
              {extension.displayName}
            </h3>
            <p class="mt-1 truncate text-xs text-ink-muted">
              {extension.publisherDisplayName} · {extension.publisherName}.{extension.extensionName}
            </p>
            {#if extension.shortDescription}
              <p class="mt-2 line-clamp-2 text-xs leading-5 text-ink-muted">{extension.shortDescription}</p>
            {/if}
            <p class="mt-2 text-xs leading-5 text-ink-muted">
              {formatCount(extension.installCount)} installs · {formatRating(extension)} · {extension.themes.length}
              color theme{extension.themes.length === 1 ? '' : 's'}: <span class="text-ink-bright">{themeLabels(extension)}</span>
            </p>
          </div>

          <div class="grid gap-2 self-start">
            <Button
              type="button"
              disabled={!extension.packageUrl || Boolean(installingExtensionId)}
              size="sm"
              class="w-full"
              onclick={() => installMarketplaceExtension(extension)}
            >
              {installingExtensionId === extension.extensionId ? 'Installing…' : 'Install'}
            </Button>
            <Button
              type="button"
              size="sm"
              class="w-full"
              onclick={() => openMarketplaceExtension(extension)}
            >
              Open
            </Button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>
