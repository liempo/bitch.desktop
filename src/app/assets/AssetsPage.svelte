<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import {
    createRemoteDirectory,
    deleteRemotePath,
    fetchRemoteFileListing,
    readRemoteFileDataUrl,
    readRemoteFileText,
    readRemoteManagedFileDataUrl,
    uploadRemoteFile,
    type RemoteFileEntry,
    type RemoteFileListing,
    type RemoteManagedFileDataUrlResponse
  } from '$lib/hermes/files'
  import { filePresentation } from '$lib/hermes/files'

  type FileAccent = ReturnType<typeof filePresentation>['accent']
  type ActionBusy = 'create' | 'delete' | 'download' | 'refresh' | 'upload'

  interface TreeRow {
    depth: number
    entry: RemoteFileEntry
    expanded: boolean
    loaded: boolean
    loading: boolean
  }

  let rootPath = $state('/')
  let selectedPath = $state('/')
  let selectedFile = $state<RemoteFileEntry | null>(null)
  let listings = $state<Record<string, RemoteFileListing>>({})
  let expanded = $state<Record<string, boolean>>({ '/': true })
  let loadingPaths = $state<Record<string, boolean>>({})
  let errorsByPath = $state<Record<string, string>>({})
  let textPreview = $state('')
  let textPreviewError = $state('')
  let textPreviewLoading = $state(false)
  let dataPreviewUrl = $state<null | string>(null)
  let dataPreviewError = $state('')
  let dataPreviewLoading = $state(false)
  let pathDraft = $state('/')
  let folderNameDraft = $state('')
  let createDialogOpen = $state(false)
  let deleteDialogOpen = $state(false)
  let fileInputElement = $state<HTMLInputElement | null>(null)
  let actionBusy = $state<ActionBusy | null>(null)
  let actionError = $state('')
  let lastActionMessage = $state('')

  const selectedError = $derived(errorsByPath[selectedPath] ?? '')
  const selectedLoading = $derived(loadingPaths[selectedPath] === true)
  const selectedFilePresentation = $derived(selectedFile ? filePresentation(selectedFile.name) : null)
  const selectedViewerKind = $derived(
    selectedFilePresentation?.viewerKind === 'download' ? 'text' : selectedFilePresentation?.viewerKind
  )
  const currentDirectoryPath = $derived(selectedFile ? parentDirectory(selectedFile.path) : selectedPath)
  const selectedActionPath = $derived(selectedFile?.path ?? selectedPath)
  const selectedActionKind = $derived(selectedFile ? 'file' : 'directory')
  const selectedTypeLabel = $derived(selectedFile ? (selectedFile.mimeType ?? selectedFilePresentation?.title ?? 'File') : 'Directory')
  const selectedSizeLabel = $derived(selectedFile ? formatBytes(selectedFile.size) : '—')
  const actionsDisabled = $derived(actionBusy !== null)
  const deleteDisabled = $derived(actionsDisabled || selectedActionPath === '/')
  const treeRows = $derived.by(() => buildTreeRows())

  onMount(() => {
    void openInitialDirectory()
  })

  function directoryEntry(path: string, name: string): RemoteFileEntry {
    return { kind: 'directory', name, path }
  }

  async function openInitialDirectory(): Promise<void> {
    rootPath = '/'
    expanded = { '/': true }
    pathDraft = '/'
    await openDirectory('/')
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

    visit(rootPath, rootPath, 0)
    return rows
  }

  function messageForError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  function normalizeRemotePath(path: string): string {
    const trimmed = path.trim()
    const rooted = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    const normalized = rooted.replace(/\/+/g, '/')
    return normalized.length > 1 ? normalized.replace(/\/$/, '') : '/'
  }

  function parentDirectory(path: string): string {
    const normalized = normalizeRemotePath(path)
    const parts = normalized.split('/').filter(Boolean)
    parts.pop()
    return parts.length ? `/${parts.join('/')}` : '/'
  }

  function joinRemotePath(directory: string, name: string): string {
    const cleanName = name.trim().replace(/^\/+|\/+$/g, '')
    const cleanDirectory = normalizeRemotePath(directory)
    if (!cleanName) return cleanDirectory
    return normalizeRemotePath(`${cleanDirectory === '/' ? '' : cleanDirectory}/${cleanName}`)
  }

  async function loadPath(path: string, force = false): Promise<void> {
    if (!force && listings[path]) return
    if (loadingPaths[path]) return

    loadingPaths = { ...loadingPaths, [path]: true }
    errorsByPath = { ...errorsByPath, [path]: '' }

    try {
      const listing = await fetchRemoteFileListing(path)
      listings = { ...listings, [listing.path]: listing }
      if (listing.error) errorsByPath = { ...errorsByPath, [path]: listing.error }
    } catch (error) {
      errorsByPath = { ...errorsByPath, [path]: messageForError(error) }
    } finally {
      loadingPaths = { ...loadingPaths, [path]: false }
    }
  }

  async function openDirectory(path: string, force = false): Promise<void> {
    const nextPath = normalizeRemotePath(path)
    selectedPath = nextPath
    pathDraft = nextPath
    selectedFile = null
    expanded = { ...expanded, [nextPath]: true }
    await loadPath(nextPath, force)
  }

  function toggleTreeRow(row: TreeRow): void {
    if (row.entry.kind !== 'directory') return

    const nextExpanded = !row.expanded
    expanded = { ...expanded, [row.entry.path]: nextExpanded }
    selectedPath = row.entry.path
    pathDraft = row.entry.path
    selectedFile = null

    if (nextExpanded) void loadPath(row.entry.path)
  }

  function selectTreeRow(row: TreeRow): void {
    if (row.entry.kind === 'directory') {
      void openDirectory(row.entry.path)
    } else {
      selectFile(row.entry)
    }
  }

  function selectFile(entry: RemoteFileEntry): void {
    if (entry.kind !== 'file') return

    selectedFile = entry
    pathDraft = parentDirectory(entry.path)
    textPreview = ''
    textPreviewError = ''
    textPreviewLoading = false
    dataPreviewUrl = null
    dataPreviewError = ''
    dataPreviewLoading = false

    const viewerKind = filePresentation(entry.name).viewerKind
    if (viewerKind === 'text' || viewerKind === 'download') {
      void loadTextPreview(entry)
    } else {
      void loadDataPreview(entry)
    }
  }

  async function loadTextPreview(entry: RemoteFileEntry): Promise<void> {
    const previewPath = entry.path
    textPreviewLoading = true
    textPreviewError = ''

    try {
      const response = await readRemoteFileText(previewPath)
      if (selectedFile?.path !== previewPath) return
      textPreview = response.text
    } catch (error) {
      if (selectedFile?.path === previewPath) textPreviewError = messageForError(error)
    } finally {
      if (selectedFile?.path === previewPath) textPreviewLoading = false
    }
  }

  async function loadDataPreview(entry: RemoteFileEntry): Promise<void> {
    const previewPath = entry.path
    dataPreviewLoading = true
    dataPreviewError = ''

    try {
      const url = await readRemoteFileDataUrl(previewPath)
      if (selectedFile?.path !== previewPath) return
      dataPreviewUrl = url
    } catch (error) {
      if (selectedFile?.path === previewPath) dataPreviewError = messageForError(error)
    } finally {
      if (selectedFile?.path === previewPath) dataPreviewLoading = false
    }
  }

  function clearActionFeedback(): void {
    actionError = ''
    lastActionMessage = ''
  }

  async function refreshCurrentDirectory(): Promise<void> {
    const setBusy = actionBusy === null
    const directory = currentDirectoryPath
    if (setBusy) {
      clearActionFeedback()
      actionBusy = 'refresh'
    }

    try {
      await openDirectory(directory, true)
      if (setBusy) lastActionMessage = `Refreshed ${directory}`
    } catch (error) {
      if (setBusy) actionError = messageForError(error)
    } finally {
      if (setBusy) actionBusy = null
    }
  }

  function applyPathDraft(event: SubmitEvent): void {
    event.preventDefault()
    if (actionsDisabled) return
    void openDirectory(pathDraft, true)
  }

  function openCreateDialog(): void {
    if (actionsDisabled) return
    folderNameDraft = ''
    createDialogOpen = true
  }

  async function createFolder(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const folderPath = joinRemotePath(currentDirectoryPath, folderNameDraft)
    if (!folderNameDraft.trim() || actionBusy !== null) return

    clearActionFeedback()
    actionBusy = 'create'
    try {
      await createRemoteDirectory(folderPath)
      await refreshCurrentDirectory()
      folderNameDraft = ''
      createDialogOpen = false
      lastActionMessage = `Created remote folder ${folderPath}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function requestFileUpload(): void {
    if (actionsDisabled) return
    fileInputElement?.click()
  }

  async function handleFileInput(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    if (!input.files?.length) return
    await uploadFiles(input.files)
    input.value = ''
  }

  function allowUploadDrop(event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  async function handleDropUpload(event: DragEvent): Promise<void> {
    event.preventDefault()
    const files = event.dataTransfer?.files
    if (!files?.length) return
    await uploadFiles(files)
  }

  async function uploadFiles(files: FileList | File[]): Promise<void> {
    const queuedFiles = Array.from(files)
    if (!queuedFiles.length || actionBusy !== null) return

    clearActionFeedback()
    actionBusy = 'upload'
    try {
      for (const file of queuedFiles) {
        await uploadRemoteFile({
          file,
          fileName: file.name,
          overwrite: true,
          path: joinRemotePath(currentDirectoryPath, file.name)
        })
      }
      await refreshCurrentDirectory()
      lastActionMessage = `Uploaded ${queuedFiles.length} file${queuedFiles.length === 1 ? '' : 's'} to ${currentDirectoryPath}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function triggerBrowserDownload(download: RemoteManagedFileDataUrlResponse): void {
    const link = document.createElement('a')
    link.href = download.dataUrl
    link.download = download.name || download.path.split('/').filter(Boolean).pop() || 'download'
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
  }

  async function downloadSelectedFile(): Promise<void> {
    if (!selectedFile || actionBusy !== null) return

    clearActionFeedback()
    actionBusy = 'download'
    try {
      const download = await readRemoteManagedFileDataUrl(selectedFile.path)
      triggerBrowserDownload(download)
      lastActionMessage = `Prepared download for ${download.path}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function requestDeleteSelectedPath(): void {
    if (deleteDisabled) return
    deleteDialogOpen = true
  }

  async function confirmDeleteSelectedPath(): Promise<void> {
    if (deleteDisabled) return

    const deletedPath = selectedActionPath
    const deletedKind = selectedActionKind
    const nextDirectory = deletedKind === 'directory' ? parentDirectory(deletedPath) : currentDirectoryPath
    clearActionFeedback()
    actionBusy = 'delete'

    try {
      await deleteRemotePath(selectedActionPath, { recursive: selectedActionKind === 'directory' })
      const nextListings = { ...listings }
      delete nextListings[deletedPath]
      listings = nextListings
      expanded = { ...expanded, [deletedPath]: false }
      selectedFile = null
      selectedPath = nextDirectory
      pathDraft = nextDirectory
      await refreshCurrentDirectory()
      deleteDialogOpen = false
      lastActionMessage = `Deleted remote ${deletedKind} ${deletedPath}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function treeIconFor(entry: RemoteFileEntry): string {
    if (entry.kind === 'directory') return '▣'
    return filePresentation(entry.name).glyph
  }

  function thumbnailClass(accent: FileAccent): string {
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
      case 'html':
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
  aria-label="Remote assets browser"
>
  <Panel title="Remote Assets" padded={false} contentClass="flex min-h-0 flex-col p-2" class="min-w-0" actions={treeActions}>
    <div class="mb-2 grid gap-2 border-b border-line pb-2">
      <form class="grid gap-1" onsubmit={applyPathDraft}>
        <label class="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-ink-muted" for="assets-current-directory">
          Current directory
        </label>
        <div class="flex min-w-0 gap-1">
          <input
            id="assets-current-directory"
            bind:value={pathDraft}
            class="min-w-0 flex-1 rounded-control border border-line bg-canvas px-2 py-1 font-mono text-[0.66rem] text-ink-bright outline-none focus:border-primary/70"
            spellcheck="false"
            disabled={actionsDisabled}
            aria-label="Current directory"
          />
          <Button size="sm" variant="secondary" disabled={actionsDisabled}>Go</Button>
        </div>
      </form>

      <div class="flex flex-wrap items-center gap-1">
        <Button size="sm" chrome="ghost" variant="primary" onclick={() => void refreshCurrentDirectory()} disabled={actionsDisabled}>
          Refresh
        </Button>
        <Button size="sm" chrome="ghost" variant="secondary" onclick={openCreateDialog} disabled={actionsDisabled}>
          Create folder
        </Button>
        <Button size="sm" chrome="ghost" variant="success" onclick={requestFileUpload} disabled={actionsDisabled}>Upload</Button>
        <Button
          size="sm"
          chrome="ghost"
          variant="warning"
          onclick={() => void downloadSelectedFile()}
          disabled={!selectedFile || actionsDisabled}
        >
          Download
        </Button>
        <Button size="sm" chrome="ghost" variant="danger" onclick={requestDeleteSelectedPath} disabled={deleteDisabled}>
          Delete
        </Button>
      </div>

      <input
        bind:this={fileInputElement}
        class="hidden"
        type="file"
        multiple
        onchange={(event) => void handleFileInput(event)}
        aria-label="Upload remote files"
      />

      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-control border border-line/70 bg-surface-muted/30 p-2 text-[0.62rem] leading-4">
        <dt class="uppercase tracking-[0.12em] text-ink-muted">Selected path</dt>
        <dd class="min-w-0 truncate font-mono text-ink-bright" title={selectedActionPath}>{selectedActionPath}</dd>
        <dt class="uppercase tracking-[0.12em] text-ink-muted">Kind</dt>
        <dd class="font-mono uppercase text-ink-bright">{selectedActionKind}</dd>
        <dt class="uppercase tracking-[0.12em] text-ink-muted">Type</dt>
        <dd class="min-w-0 truncate font-mono text-ink-bright">{selectedTypeLabel}</dd>
        <dt class="uppercase tracking-[0.12em] text-ink-muted">Size</dt>
        <dd class="font-mono text-ink-bright">{selectedSizeLabel}</dd>
      </dl>
    </div>

    {#if actionError}
      <div class="mb-2 rounded-control border border-danger/40 bg-danger/10 p-2 text-xs leading-5 text-danger" role="alert">
        Remote action failed: {actionError}
      </div>
    {:else if lastActionMessage}
      <div class="mb-2 rounded-control border border-success/40 bg-success/10 p-2 text-xs leading-5 text-success" role="status">
        {lastActionMessage}
      </div>
    {/if}

    {#if selectedError}
      <div class="mb-2 rounded-control border border-danger/40 bg-danger/10 p-2 text-xs leading-5 text-danger" role="alert">
        Remote file listing unavailable: {selectedError}
      </div>
    {:else if selectedLoading}
      <div class="mb-2 rounded-control border border-primary/30 bg-primary/10 p-2 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-primary">
        Reading remote file index…
      </div>
    {/if}

    <div
      class="min-h-0 flex-1 overflow-auto rounded-control border border-dashed border-transparent p-1 hover:border-primary/25"
      data-selectable="true"
      aria-label="Remote file tree; drop files here to upload"
      role="region"
      ondragover={allowUploadDrop}
      ondrop={(event) => void handleDropUpload(event)}
    >
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
            <span class="shrink-0 text-[0.58rem] text-ink-faint">{formatBytes(row.entry.size)}</span>
          </button>
        {/if}
      {/each}
    </div>
  </Panel>

  <Panel title="Asset Viewer" padded={false} contentClass="flex min-h-0 flex-col p-3" class="min-w-0">
    {#if !selectedFile || !selectedFilePresentation}
      <div class="flex flex-1 items-center justify-center rounded-panel border border-dashed border-line bg-surface-raised/40 p-6 text-center text-sm leading-6 text-ink-muted">
        Select a remote asset from the tree to inspect it. Drag files into the tree to upload them through the authenticated Hermes filesystem lane.
      </div>
    {:else}
      <div class="mb-3 flex min-h-0 items-start gap-3 border-b border-line pb-3">
        <span class={thumbnailClass(selectedFilePresentation.accent)} style="width: 5rem; min-width: 5rem; height: 4rem">
          {#if selectedViewerKind === 'image' && dataPreviewUrl}
            <img src={dataPreviewUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            <span>{selectedFilePresentation.glyph}</span>
          {/if}
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-ink-bright" title={selectedFile.name}>{selectedFile.name}</h2>
          <p class="truncate font-mono text-[0.66rem] text-ink-muted" title={selectedFile.path}>{selectedFile.path}</p>
          <p class="mt-1 text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">
            {selectedFilePresentation.title} · {selectedFile.mimeType ?? 'remote file'} · {formatBytes(selectedFile.size)}
          </p>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-hidden rounded-panel border border-line bg-canvas/55">
        {#if dataPreviewLoading}
          <div class="flex h-full items-center justify-center text-[0.72rem] uppercase tracking-[0.18em] text-primary">
            Loading remote file preview…
          </div>
        {:else if dataPreviewError}
          <div class="m-3 rounded-panel border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-danger" role="alert">
            File preview unavailable: {dataPreviewError}
          </div>
        {:else if selectedViewerKind === 'image' && dataPreviewUrl}
          <div class="flex h-full items-center justify-center overflow-auto bg-black/20 p-2">
            <img src={dataPreviewUrl} alt={selectedFile.name} class="max-h-full max-w-full rounded-control object-contain" />
          </div>
        {:else if selectedViewerKind === 'pdf' && dataPreviewUrl}
          <iframe title={selectedFile.name} src={dataPreviewUrl} class="h-full w-full bg-white"></iframe>
        {:else if selectedViewerKind === 'video' && dataPreviewUrl}
          <div class="flex h-full items-center justify-center bg-black/30 p-2">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video controls src={dataPreviewUrl} class="max-h-full max-w-full rounded-control"></video>
          </div>
        {:else if selectedViewerKind === 'audio' && dataPreviewUrl}
          <div class="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-ink-muted">
            <span class="font-hud text-4xl text-success">AUD</span>
            <audio controls src={dataPreviewUrl} class="w-full"></audio>
          </div>
        {:else if selectedViewerKind === 'html' && dataPreviewUrl}
          <iframe title={selectedFile.name} src={dataPreviewUrl} class="h-full w-full bg-white"></iframe>
        {:else if selectedViewerKind === 'text'}
          {#if textPreviewLoading}
            <div class="flex h-full items-center justify-center text-[0.72rem] uppercase tracking-[0.18em] text-primary">
              Loading text preview…
            </div>
          {:else if textPreviewError}
            <div class="m-3 rounded-panel border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-danger" role="alert">
              File preview unavailable: {textPreviewError}
            </div>
          {:else}
            <pre class="h-full overflow-auto p-3 text-xs leading-5 whitespace-pre-wrap text-ink-bright" data-selectable="true">{textPreview}</pre>
          {/if}
        {:else}
          <pre class="h-full overflow-auto p-3 text-xs leading-5 whitespace-pre-wrap text-ink-bright" data-selectable="true">{textPreview}</pre>
        {/if}
      </div>
    {/if}
  </Panel>
</section>

<Dialog bind:open={createDialogOpen} title="Create remote folder" description={`Parent ${currentDirectoryPath}`}>
  <form class="grid gap-3 p-3" onsubmit={(event) => void createFolder(event)}>
    <label class="grid gap-1 text-[0.65rem] uppercase tracking-[0.14em] text-ink-muted">
      <span>Folder name</span>
      <input
        bind:value={folderNameDraft}
        class="rounded-control border border-line bg-canvas px-2 py-2 font-mono text-[0.75rem] text-ink-bright outline-none focus:border-secondary/70"
        required
        disabled={actionsDisabled}
        autocomplete="off"
      />
    </label>
    <div class="rounded-control border border-line bg-surface-muted/40 p-2 font-mono text-[0.68rem] text-ink-muted">
      Target path: {joinRemotePath(currentDirectoryPath, folderNameDraft || 'new-folder')}
    </div>
    <div class="flex justify-end gap-2">
      <Button size="sm" chrome="ghost" onclick={() => (createDialogOpen = false)} disabled={actionsDisabled}>Cancel</Button>
      <Button size="sm" variant="secondary" disabled={actionsDisabled || !folderNameDraft.trim()}>Create folder</Button>
    </div>
  </form>
</Dialog>

<Dialog bind:open={deleteDialogOpen} title="Delete remote path" description="Remote filesystem confirmation">
  <div class="grid gap-3 p-3 text-sm leading-6 text-ink-muted">
    <p>This cannot be undone.</p>
    <p>
      Delete the selected remote {selectedActionKind}?
    </p>
    <code class="rounded-control border border-danger/35 bg-danger/10 p-2 font-mono text-[0.72rem] text-danger" data-selectable="true">
      {selectedActionPath}
    </code>
    <div class="flex justify-end gap-2">
      <Button size="sm" chrome="ghost" onclick={() => (deleteDialogOpen = false)} disabled={actionsDisabled}>Cancel</Button>
      <Button size="sm" variant="danger" onclick={() => void confirmDeleteSelectedPath()} disabled={actionsDisabled}>
        Delete remote path
      </Button>
    </div>
  </div>
</Dialog>

{#snippet treeActions()}
  {#if actionBusy !== null}
    <span class="font-hud text-[0.58rem] uppercase tracking-[0.16em] text-primary">{actionBusy}</span>
  {:else}
    <span class="font-hud text-[0.58rem] uppercase tracking-[0.16em] text-ink-faint">remote</span>
  {/if}
{/snippet}
