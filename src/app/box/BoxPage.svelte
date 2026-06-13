<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import { tagClass } from '@/components/ui/styles'
  import { BOX_BASE_URL, boxUrlForAgentPath, fetchBoxListing, type BoxEntry, type BoxListing } from '$lib/box'

  interface TreeRow {
    depth: number
    entry: BoxEntry
    expanded: boolean
    loaded: boolean
    loading: boolean
  }

  let selectedPath = $state('/')
  let listings = $state<Record<string, BoxListing>>({})
  let expanded = $state<Record<string, boolean>>({ '/': true })
  let loadingPaths = $state<Record<string, boolean>>({})
  let errorsByPath = $state<Record<string, string>>({})

  const selectedListing = $derived(listings[selectedPath] ?? null)
  const selectedEntries = $derived(selectedListing?.entries ?? [])
  const selectedError = $derived(errorsByPath[selectedPath] ?? '')
  const selectedLoading = $derived(loadingPaths[selectedPath] === true)
  const breadcrumbs = $derived.by(() => breadcrumbParts(selectedPath))
  const treeRows = $derived.by(() => buildTreeRows())

  onMount(() => {
    void openDirectory('/')
  })

  function directoryEntry(path: string, name: string): BoxEntry {
    return {
      kind: 'directory',
      name,
      path,
      url: boxDirectoryUrl(path)
    }
  }

  function boxDirectoryUrl(path: string): string {
    const agentPath = path === '/' ? '/box' : `/box${path}`
    const url = boxUrlForAgentPath(agentPath) ?? BOX_BASE_URL

    return url.endsWith('/') ? url : `${url}/`
  }

  function buildTreeRows(): TreeRow[] {
    const rows: TreeRow[] = []
    const seen = new Set<string>()

    function visit(path: string, name: string, depth: number): void {
      if (seen.has(path)) return
      seen.add(path)

      const listing = listings[path]
      const rowEntry = directoryEntry(path, name)
      rows.push({
        depth,
        entry: rowEntry,
        expanded: expanded[path] === true,
        loaded: Boolean(listing),
        loading: loadingPaths[path] === true
      })

      if (!expanded[path] || !listing) return

      for (const entry of listing.entries) {
        if (entry.kind === 'directory') {
          visit(entry.path, entry.name, depth + 1)
        } else {
          rows.push({
            depth: depth + 1,
            entry,
            expanded: false,
            loaded: true,
            loading: false
          })
        }
      }
    }

    visit('/', 'box', 0)
    return rows
  }

  function breadcrumbParts(path: string): Array<{ label: string; path: string }> {
    if (path === '/') return [{ label: 'box', path: '/' }]

    const parts = path.split('/').filter(Boolean)
    const result = [{ label: 'box', path: '/' }]
    let current = ''

    for (const part of parts) {
      current = `${current}/${part}`
      result.push({ label: part, path: current })
    }

    return result
  }

  function messageForError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  async function loadPath(path: string, force = false): Promise<void> {
    if (!force && listings[path]) return
    if (loadingPaths[path]) return

    loadingPaths = { ...loadingPaths, [path]: true }
    errorsByPath = { ...errorsByPath, [path]: '' }

    try {
      const listing = await fetchBoxListing(path)
      listings = { ...listings, [listing.path]: listing }
    } catch (error) {
      errorsByPath = { ...errorsByPath, [path]: messageForError(error) }
    } finally {
      loadingPaths = { ...loadingPaths, [path]: false }
    }
  }

  async function openDirectory(path: string, force = false): Promise<void> {
    selectedPath = path
    expanded = { ...expanded, [path]: true }
    await loadPath(path, force)
  }

  function toggleTreeRow(row: TreeRow): void {
    if (row.entry.kind !== 'directory') return

    const nextExpanded = !row.expanded
    expanded = { ...expanded, [row.entry.path]: nextExpanded }
    selectedPath = row.entry.path

    if (nextExpanded) {
      void loadPath(row.entry.path)
    }
  }

  function selectTreeRow(row: TreeRow): void {
    if (row.entry.kind === 'directory') {
      void openDirectory(row.entry.path)
    }
  }

  function iconFor(entry: BoxEntry): string {
    if (entry.kind === 'directory') return '▣'

    const extension = entry.name.split('.').pop()?.toLowerCase() ?? ''
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return '▧'
    if (extension === 'pdf') return '▤'
    if (['md', 'txt', 'log', 'json', 'yaml', 'yml', 'toml'].includes(extension)) return '☰'

    return '◇'
  }

  function formatBytes(size: number | undefined): string {
    if (typeof size !== 'number') return '—'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  function formatMtime(mtime: number | undefined): string {
    if (typeof mtime !== 'number') return 'not indexed'

    const date = new Date(mtime)
    if (Number.isNaN(date.getTime())) return 'not indexed'

    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function rowStyle(depth: number): string {
    return `padding-left: ${0.5 + depth * 0.85}rem`
  }

  function rowClass(row: TreeRow): string {
    const base =
      'flex min-h-6 w-full items-center gap-1 rounded-control border border-transparent pr-2 text-left text-[0.75rem] leading-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    const active = row.entry.path === selectedPath
      ? 'border-primary/35 bg-primary/10 text-primary'
      : 'text-ink-muted hover:border-line hover:bg-surface-raised hover:text-ink-bright'

    return `${base} ${active}`
  }
</script>

<section class="grid h-full min-h-0 grid-cols-[minmax(15rem,22rem)_minmax(0,1fr)] gap-3 bg-chat-scroll/40 p-4" aria-label="BOX browser">
  <Panel title="BOX Tree" padded={false} contentClass="p-2" class="min-w-0" actions={treeActions}>
    <div class="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
      <span class={tagClass}>Dufs</span>
      <span class="min-w-0 truncate text-[0.65rem] text-ink-muted" title={BOX_BASE_URL}>{BOX_BASE_URL}</span>
    </div>

    <div class="h-full min-h-0 overflow-auto" data-selectable="true">
      {#each treeRows as row (row.entry.path)}
        {#if row.entry.kind === 'directory'}
          <button
            type="button"
            class={rowClass(row)}
            style={rowStyle(row.depth)}
            aria-expanded={row.expanded}
            aria-current={row.entry.path === selectedPath ? 'true' : undefined}
            onclick={() => selectTreeRow(row)}
            ondblclick={() => toggleTreeRow(row)}
          >
            <span class="w-3 text-center text-[0.6rem] text-line-strong">{row.expanded ? '▾' : '▸'}</span>
            <span class="text-secondary">▣</span>
            <span class="min-w-0 flex-1 truncate">{row.entry.name}</span>
            {#if row.loading}
              <span class="text-[0.58rem] uppercase tracking-[0.12em] text-primary">sync</span>
            {/if}
          </button>
        {:else}
          <a class={rowClass(row)} style={rowStyle(row.depth)} href={row.entry.url} title={row.entry.path}>
            <span class="w-3 text-center text-[0.6rem] text-line-strong"></span>
            <span class="text-warning">{iconFor(row.entry)}</span>
            <span class="min-w-0 flex-1 truncate">{row.entry.name}</span>
          </a>
        {/if}
      {/each}
    </div>
  </Panel>

  <Panel title="Icon View" padded={false} contentClass="flex min-h-0 flex-col p-3" class="min-w-0" actions={iconActions}>
    <div class="mb-3 flex min-h-8 items-center gap-1 border-b border-line pb-2 font-hud text-[0.68rem] uppercase tracking-[0.14em] text-ink-muted">
      {#each breadcrumbs as crumb, index (crumb.path)}
        {#if index > 0}
          <span class="text-line-strong">/</span>
        {/if}
        <button
          type="button"
          class="rounded-control px-1 text-primary hover:bg-primary/10 hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
          onclick={() => openDirectory(crumb.path)}
        >
          {crumb.label}
        </button>
      {/each}
    </div>

    {#if selectedError}
      <div class="rounded-panel border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-danger" role="alert">
        BOX listing unavailable: {selectedError}
      </div>
    {:else if selectedLoading && !selectedListing}
      <div class="flex flex-1 items-center justify-center text-[0.72rem] uppercase tracking-[0.18em] text-primary">
        Reading BOX index…
      </div>
    {:else if selectedEntries.length === 0}
      <div class="flex flex-1 items-center justify-center text-center text-sm text-ink-muted">
        No entries here. The shelf is clean, which is either discipline or evidence tampering.
      </div>
    {:else}
      <div class="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 overflow-auto pr-1" data-selectable="true">
        {#each selectedEntries as entry (entry.path)}
          {#if entry.kind === 'directory'}
            <button
              type="button"
              class="group flex min-h-28 flex-col items-start gap-2 rounded-panel border border-line bg-surface-raised/60 p-3 text-left hover:border-secondary/60 hover:bg-secondary/10 focus-visible:outline-2 focus-visible:outline-focus"
              title={entry.path}
              onclick={() => openDirectory(entry.path)}
            >
              <span class="font-hud text-2xl text-secondary">{iconFor(entry)}</span>
              <span class="w-full truncate text-[0.78rem] font-semibold text-ink-bright group-hover:text-secondary">{entry.name}</span>
              <span class="text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">{formatBytes(entry.size)} · folder</span>
            </button>
          {:else}
            <a
              class="group flex min-h-28 flex-col items-start gap-2 rounded-panel border border-line bg-surface-raised/60 p-3 text-left no-underline hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus"
              href={entry.url}
              title={entry.path}
            >
              <span class="font-hud text-2xl text-warning">{iconFor(entry)}</span>
              <span class="w-full truncate text-[0.78rem] font-semibold text-ink-bright group-hover:text-primary">{entry.name}</span>
              <span class="text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">{formatBytes(entry.size)}</span>
              <span class="text-[0.6rem] uppercase tracking-[0.12em] text-ink-muted/80">{formatMtime(entry.mtime)}</span>
            </a>
          {/if}
        {/each}
      </div>
    {/if}
  </Panel>
</section>

{#snippet treeActions()}
  <Button size="sm" chrome="ghost" variant="primary" onclick={() => openDirectory(selectedPath, true)}>Refresh</Button>
{/snippet}

{#snippet iconActions()}
  <a class="font-hud text-[0.65rem] font-bold uppercase tracking-[0.14em] text-primary hover:text-ink-bright" href={boxDirectoryUrl(selectedListing?.path ?? selectedPath)}>
    Open
  </a>
{/snippet}
