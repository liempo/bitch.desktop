<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import { BOX_BASE_URL, boxUrlForAgentPath, fetchBoxListing, type BoxEntry, type BoxListing } from '$lib/box'
  import { boxFilePresentation, isTextPreviewFile, type BoxFileAccent } from '$lib/box-file'

  interface TreeRow {
    depth: number
    entry: BoxEntry
    expanded: boolean
    loaded: boolean
    loading: boolean
  }

  const MAX_TEXT_PREVIEW_CHARS = 200_000

  let selectedPath = $state('/')
  let selectedFile = $state<BoxEntry | null>(null)
  let listings = $state<Record<string, BoxListing>>({})
  let expanded = $state<Record<string, boolean>>({ '/': true })
  let loadingPaths = $state<Record<string, boolean>>({})
  let errorsByPath = $state<Record<string, string>>({})
  let textPreview = $state('')
  let textPreviewError = $state('')
  let textPreviewLoading = $state(false)

  const selectedError = $derived(errorsByPath[selectedPath] ?? '')
  const selectedLoading = $derived(loadingPaths[selectedPath] === true)
  const selectedFilePresentation = $derived(selectedFile ? boxFilePresentation(selectedFile.name) : null)
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
    selectedFile = null
    expanded = { ...expanded, [path]: true }
    await loadPath(path, force)
  }

  function toggleTreeRow(row: TreeRow): void {
    if (row.entry.kind !== 'directory') return

    const nextExpanded = !row.expanded
    expanded = { ...expanded, [row.entry.path]: nextExpanded }
    selectedPath = row.entry.path
    selectedFile = null

    if (nextExpanded) {
      void loadPath(row.entry.path)
    }
  }

  function selectTreeRow(row: TreeRow): void {
    if (row.entry.kind === 'directory') {
      void openDirectory(row.entry.path)
    } else {
      selectFile(row.entry)
    }
  }

  function selectFile(entry: BoxEntry): void {
    if (entry.kind !== 'file') return

    selectedFile = entry
    textPreview = ''
    textPreviewError = ''
    textPreviewLoading = false

    if (isTextPreviewFile(entry.name)) {
      void loadTextPreview(entry)
    }
  }

  async function loadTextPreview(entry: BoxEntry): Promise<void> {
    const previewPath = entry.path
    textPreviewLoading = true
    textPreviewError = ''

    try {
      const response = await fetch(entry.url, { headers: { Accept: 'text/plain, application/json, */*' } })
      if (!response.ok) throw new Error(`file fetch failed (${response.status})`)

      const text = await response.text()
      if (selectedFile?.path !== previewPath) return

      textPreview =
        text.length > MAX_TEXT_PREVIEW_CHARS
          ? `${text.slice(0, MAX_TEXT_PREVIEW_CHARS)}\n\n… truncated at ${formatBytes(MAX_TEXT_PREVIEW_CHARS)} …`
          : text
    } catch (error) {
      if (selectedFile?.path === previewPath) textPreviewError = messageForError(error)
    } finally {
      if (selectedFile?.path === previewPath) textPreviewLoading = false
    }
  }

  function treeIconFor(entry: BoxEntry): string {
    if (entry.kind === 'directory') return '▣'
    return boxFilePresentation(entry.name).glyph
  }

  function thumbnailClass(accent: BoxFileAccent): string {
    const base =
      'relative flex h-20 w-full items-center justify-center overflow-hidden rounded-control border font-hud text-lg font-black uppercase tracking-[0.12em]'

    switch (accent) {
      case 'image':
        return `${base} border-primary/40 bg-primary/10 text-primary`
      case 'pdf':
        return `${base} border-danger/45 bg-danger/10 text-danger`
      case 'video':
        return `${base} border-secondary/50 bg-secondary/10 text-secondary`
      case 'audio':
        return `${base} border-success/45 bg-success/10 text-success`
      case 'archive':
        return `${base} border-warning/45 bg-warning/10 text-warning`
      case 'code':
        return `${base} border-purple-400/45 bg-purple-400/10 text-purple-200`
      case 'text':
        return `${base} border-line bg-surface text-ink-bright`
      default:
        return `${base} border-line bg-surface-muted/70 text-ink-muted`
    }
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
    const active =
      (row.entry.kind === 'directory' && row.entry.path === selectedPath) || row.entry.path === selectedFile?.path
        ? 'border-primary/35 bg-primary/10 text-primary'
        : 'text-ink-muted hover:border-line hover:bg-surface-raised hover:text-ink-bright'

    return `${base} ${active}`
  }
</script>

<section
  class="grid h-full min-h-0 grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] gap-3 bg-chat-scroll/40 p-4"
  aria-label="BOX browser"
>
  <Panel title="BOX Tree" padded={false} contentClass="flex min-h-0 flex-col p-2" class="min-w-0" actions={treeActions}>
    <div class="mb-2 flex items-center border-b border-line pb-2">
      <span class="min-w-0 truncate text-[0.65rem] text-ink-muted" title={BOX_BASE_URL}>{BOX_BASE_URL}</span>
    </div>

    {#if selectedError}
      <div class="mb-2 rounded-control border border-danger/40 bg-danger/10 p-2 text-xs leading-5 text-danger" role="alert">
        BOX listing unavailable: {selectedError}
      </div>
    {:else if selectedLoading}
      <div class="mb-2 rounded-control border border-primary/30 bg-primary/10 p-2 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-primary">
        Reading BOX index…
      </div>
    {/if}

    <div class="min-h-0 flex-1 overflow-auto" data-selectable="true">
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
          <button
            type="button"
            class={rowClass(row)}
            style={rowStyle(row.depth)}
            title={row.entry.path}
            aria-current={row.entry.path === selectedFile?.path ? 'true' : undefined}
            onclick={() => selectTreeRow(row)}
          >
            <span class="w-3 text-center text-[0.6rem] text-line-strong"></span>
            <span class="w-8 text-warning">{treeIconFor(row.entry)}</span>
            <span class="min-w-0 flex-1 truncate">{row.entry.name}</span>
          </button>
        {/if}
      {/each}
    </div>
  </Panel>

  <Panel title="File Viewer" padded={false} contentClass="flex min-h-0 flex-col p-3" class="min-w-0">
    {#if !selectedFile || !selectedFilePresentation}
      <div class="flex flex-1 items-center justify-center rounded-panel border border-dashed border-line bg-surface-raised/40 p-6 text-center text-sm leading-6 text-ink-muted">
        Select a file from the tree to inspect it. The viewer will comply. Eventually.
      </div>
    {:else}
      <div class="mb-3 flex min-h-0 items-start gap-3 border-b border-line pb-3">
        <span class={thumbnailClass(selectedFilePresentation.accent)} style="width: 5rem; min-width: 5rem; height: 4rem">
          {#if selectedFilePresentation.viewerKind === 'image'}
            <img src={selectedFile.url} alt="" class="h-full w-full object-cover" />
          {:else}
            <span>{selectedFilePresentation.glyph}</span>
          {/if}
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-ink-bright" title={selectedFile.name}>{selectedFile.name}</h2>
          <p class="truncate font-mono text-[0.66rem] text-ink-muted" title={selectedFile.path}>{selectedFile.path}</p>
          <p class="mt-1 text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">
            {selectedFilePresentation.title} · {formatBytes(selectedFile.size)} · {formatMtime(selectedFile.mtime)}
          </p>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden rounded-panel border border-line bg-canvas/55">
        {#if selectedFilePresentation.viewerKind === 'image'}
          <div class="flex h-full items-center justify-center overflow-auto bg-black/20 p-2">
            <img src={selectedFile.url} alt={selectedFile.name} class="max-h-full max-w-full rounded-control object-contain" />
          </div>
        {:else if selectedFilePresentation.viewerKind === 'pdf'}
          <iframe title={selectedFile.name} src={selectedFile.url} class="h-full w-full bg-white"></iframe>
        {:else if selectedFilePresentation.viewerKind === 'video'}
          <div class="flex h-full items-center justify-center bg-black/30 p-2">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video controls src={selectedFile.url} class="max-h-full max-w-full rounded-control"></video>
          </div>
        {:else if selectedFilePresentation.viewerKind === 'audio'}
          <div class="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-ink-muted">
            <span class="font-hud text-4xl text-success">AUD</span>
            <audio controls src={selectedFile.url} class="w-full"></audio>
          </div>
        {:else if selectedFilePresentation.viewerKind === 'text'}
          {#if textPreviewLoading}
            <div class="flex h-full items-center justify-center text-[0.72rem] uppercase tracking-[0.18em] text-primary">
              Loading file preview…
            </div>
          {:else if textPreviewError}
            <div class="m-3 rounded-panel border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-danger" role="alert">
              File preview unavailable: {textPreviewError}
            </div>
          {:else}
            <pre class="h-full overflow-auto p-3 text-xs leading-5 whitespace-pre-wrap text-ink-bright" data-selectable="true">{textPreview}</pre>
          {/if}
        {:else}
          <div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm leading-6 text-ink-muted">
            <span class="font-hud text-4xl text-warning">{selectedFilePresentation.glyph}</span>
            <p>No inline viewer for this file type. Metadata is all we get without external launch chrome.</p>
          </div>
        {/if}
      </div>
    {/if}
  </Panel>
</section>

{#snippet treeActions()}
  <Button size="sm" chrome="ghost" variant="primary" onclick={() => openDirectory(selectedPath, true)}>Refresh</Button>
{/snippet}
