<script lang="ts">
  import { onMount } from 'svelte'
  import { ContextMenu } from 'bits-ui'
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Icon from '@/app/components/ui/Icon.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { menuItemClass, popoverClass } from '@/app/components/ui/styles'
  import {
    readNamespacedStorageItem,
    removeNamespacedStorageItem,
    writeNamespacedStorageItem
  } from '$lib/storage/namespace'
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
  import type { IconName } from '$lib/theme'

  type FileAccent = ReturnType<typeof filePresentation>['accent']
  type ActionBusy = 'create' | 'delete' | 'download' | 'refresh' | 'upload'

  const PINNED_FOLDERS_STORAGE_SUFFIX = 'assetsPinnedFolders.v1'

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
  let locationDraft = $state('/')
  let folderNameDraft = $state('')
  let createTargetDirectory = $state('/')
  let uploadTargetDirectory = $state('/')
  let deleteTarget = $state<RemoteFileEntry | null>(null)
  let createDialogOpen = $state(false)
  let deleteDialogOpen = $state(false)
  let fileInputElement = $state<HTMLInputElement | null>(null)
  let actionBusy = $state<ActionBusy | null>(null)
  let actionError = $state('')
  let lastActionMessage = $state('')
  let pinnedFolders = $state<string[]>([])
  let locationHistory = $state<string[]>(['/'])
  let locationHistoryIndex = $state(0)

  const selectedError = $derived(errorsByPath[selectedPath] ?? '')
  const selectedLoading = $derived(loadingPaths[selectedPath] === true)
  const selectedFilePresentation = $derived(selectedFile ? filePresentation(selectedFile.name) : null)
  const selectedViewerKind = $derived(
    selectedFilePresentation?.viewerKind === 'download' ? 'text' : selectedFilePresentation?.viewerKind
  )
  const currentDirectoryPath = $derived(selectedFile ? parentDirectory(selectedFile.path) : selectedPath)
  const currentLocationPath = $derived(selectedFile?.path ?? selectedPath)
  const selectedActionPath = $derived(selectedFile?.path ?? selectedPath)
  const selectedActionKind = $derived(selectedFile ? 'file' : 'directory')
  const deleteActionPath = $derived(deleteTarget?.path ?? selectedActionPath)
  const deleteActionKind = $derived(deleteTarget?.kind ?? selectedActionKind)
  const actionsDisabled = $derived(actionBusy !== null)
  const canNavigateBack = $derived(locationHistoryIndex > 0)
  const canNavigateForward = $derived(locationHistoryIndex < locationHistory.length - 1)
  const canNavigateUp = $derived(currentLocationPath !== '/')
  const canDownloadCurrentFile = $derived(selectedFile !== null && actionBusy === null)
  const deleteDisabled = $derived(actionsDisabled || deleteActionPath === '/')
  const treeRows = $derived.by(() => buildTreeRows())
  const currentFolderEntries = $derived.by(() => sortedCurrentDirectoryEntries())
  const pinnedFolderEntries = $derived(pinnedFolders.map(path => directoryEntry(path, remoteNameFromPath(path))))

  const contextMenuContentClass = `${popoverClass} z-50 min-w-56 p-1.5 font-mono shadow-xl`
  const contextMenuItemClass = `${menuItemClass} grid grid-cols-[1fr_auto] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]`
  const dangerContextMenuItemClass = `${contextMenuItemClass} text-danger hover:bg-danger/10 data-[highlighted]:bg-danger/10`
  const contextMenuShortcutClass = 'text-[10px] text-ink-muted'
  const contextMenuSeparatorClass = 'mx-2 my-1 border-t border-dotted border-line-strong'

  onMount(() => {
    pinnedFolders = readPinnedFolders()
    void openInitialDirectory()
  })

  function directoryEntry(path: string, name: string): RemoteFileEntry {
    return { kind: 'directory', name, path }
  }

  function normalizePinnedFolders(value: unknown): string[] {
    const paths = Array.isArray(value) ? value : []
    const seen = new Set<string>()
    const normalized: string[] = []

    for (const path of paths) {
      if (typeof path !== 'string') continue
      const remotePath = normalizeRemotePath(path)
      if (seen.has(remotePath)) continue
      seen.add(remotePath)
      normalized.push(remotePath)
    }

    return normalized
  }

  function readPinnedFolders(): string[] {
    try {
      const raw = readNamespacedStorageItem(PINNED_FOLDERS_STORAGE_SUFFIX)
      return raw ? normalizePinnedFolders(JSON.parse(raw)) : []
    } catch {
      return []
    }
  }

  function setPinnedFolders(paths: string[]): void {
    const nextPinnedFolders = normalizePinnedFolders(paths)
    pinnedFolders = nextPinnedFolders

    if (nextPinnedFolders.length === 0) {
      removeNamespacedStorageItem(PINNED_FOLDERS_STORAGE_SUFFIX)
      return
    }

    writeNamespacedStorageItem(PINNED_FOLDERS_STORAGE_SUFFIX, JSON.stringify(nextPinnedFolders))
  }

  function isPinnedFolder(path: string): boolean {
    return pinnedFolders.includes(normalizeRemotePath(path))
  }

  function togglePinnedFolder(path: string): void {
    const remotePath = normalizeRemotePath(path)
    setPinnedFolders(
      isPinnedFolder(remotePath) ? pinnedFolders.filter(pinnedPath => pinnedPath !== remotePath) : [...pinnedFolders, remotePath]
    )
  }

  function removePinnedFolderTree(path: string): void {
    const remotePath = normalizeRemotePath(path)
    const childPrefix = `${remotePath}/`
    setPinnedFolders(pinnedFolders.filter(pinnedPath => pinnedPath !== remotePath && !pinnedPath.startsWith(childPrefix)))
  }

  async function openInitialDirectory(): Promise<void> {
    rootPath = '/'
    expanded = { '/': true }
    replaceLocationHistory('/')
    await openDirectory('/', false, false)
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

  function remoteNameFromPath(path: string): string {
    const normalized = normalizeRemotePath(path)
    if (normalized === '/') return '/'
    return normalized.split('/').filter(Boolean).pop() ?? normalized
  }

  function replaceLocationHistory(path: string): void {
    locationHistory = [normalizeRemotePath(path)]
    locationHistoryIndex = 0
  }

  function pushLocationHistory(path: string): void {
    const remotePath = normalizeRemotePath(path)
    if (locationHistory[locationHistoryIndex] === remotePath) return

    const previousHistory = locationHistory.slice(0, locationHistoryIndex + 1)
    locationHistory = [...previousHistory, remotePath]
    locationHistoryIndex = locationHistory.length - 1
  }

  function selectedActionEntry(): RemoteFileEntry {
    return selectedFile ?? directoryEntry(selectedPath, remoteNameFromPath(selectedPath))
  }

  function focusRemoteEntry(entry: RemoteFileEntry): void {
    if (entry.kind === 'directory') {
      selectedPath = normalizeRemotePath(entry.path)
      selectedFile = null
      locationDraft = selectedPath
      if (!listings[selectedPath]) void loadPath(selectedPath)
      return
    }

    selectFile(entry, false)
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

  async function openDirectory(path: string, force = false, trackHistory = true): Promise<void> {
    const nextPath = normalizeRemotePath(path)
    selectedPath = nextPath
    selectedFile = null
    locationDraft = nextPath
    expanded = { ...expanded, [nextPath]: true }
    if (trackHistory) pushLocationHistory(nextPath)
    await loadPath(nextPath, force)
  }

  function toggleTreeRow(row: TreeRow, trackHistory = true): void {
    if (row.entry.kind !== 'directory') return

    const nextPath = normalizeRemotePath(row.entry.path)
    const nextExpanded = !row.expanded
    expanded = { ...expanded, [nextPath]: nextExpanded }
    selectedPath = nextPath
    selectedFile = null
    locationDraft = nextPath
    if (trackHistory) pushLocationHistory(nextPath)

    if (nextExpanded) void loadPath(nextPath)
  }

  function selectTreeRow(row: TreeRow): void {
    if (row.entry.kind === 'directory') {
      toggleTreeRow(row)
      return
    }

    selectFile(row.entry)
  }

  function selectFile(entry: RemoteFileEntry, trackHistory = true): void {
    if (entry.kind !== 'file') return

    selectedPath = parentDirectory(entry.path)
    selectedFile = entry
    locationDraft = entry.path
    if (trackHistory) pushLocationHistory(entry.path)
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

  function findKnownEntry(path: string): RemoteFileEntry | null {
    const remotePath = normalizeRemotePath(path)
    if (remotePath === '/') return directoryEntry('/', '/')

    for (const listing of Object.values(listings)) {
      const entry = listing.entries.find(candidate => normalizeRemotePath(candidate.path) === remotePath)
      if (entry) return entry
    }

    return null
  }

  async function openLocationPath(path: string, trackHistory = true): Promise<void> {
    const nextPath = normalizeRemotePath(path)
    locationDraft = nextPath

    const knownEntry = findKnownEntry(nextPath)
    if (knownEntry) {
      await openViewerEntry(knownEntry, trackHistory)
      return
    }

    const parentPath = parentDirectory(nextPath)
    if (parentPath !== nextPath) {
      await loadPath(parentPath, true)
      const parentEntry = listings[parentPath]?.entries.find(entry => normalizeRemotePath(entry.path) === nextPath)
      if (parentEntry) {
        await openViewerEntry(parentEntry, trackHistory)
        return
      }
    }

    if (selectedFile?.path === nextPath || (!selectedFile && selectedPath === nextPath)) return
    await openDirectory(nextPath, true, trackHistory)
  }

  function applyLocationDraft(event: SubmitEvent): void {
    event.preventDefault()
    if (actionsDisabled) return

    void openLocationPath(locationDraft)
  }

  async function openViewerEntry(entry: RemoteFileEntry, trackHistory = true): Promise<void> {
    if (entry.kind === 'directory') {
      await openDirectory(entry.path, false, trackHistory)
      return
    }

    selectFile(entry, trackHistory)
  }

  function navigateBack(): void {
    if (actionsDisabled || !canNavigateBack) return

    const nextIndex = locationHistoryIndex - 1
    const nextPath = locationHistory[nextIndex]
    if (!nextPath) return

    locationHistoryIndex = nextIndex
    void openLocationPath(nextPath, false)
  }

  function navigateForward(): void {
    if (actionsDisabled || !canNavigateForward) return

    const nextIndex = locationHistoryIndex + 1
    const nextPath = locationHistory[nextIndex]
    if (!nextPath) return

    locationHistoryIndex = nextIndex
    void openLocationPath(nextPath, false)
  }

  function navigateUp(): void {
    if (actionsDisabled || !canNavigateUp) return

    void openDirectory(parentDirectory(currentLocationPath))
  }

  function downloadCurrentFile(): void {
    if (!selectedFile || !canDownloadCurrentFile) return

    void downloadFile(selectedFile)
  }

  function sortedCurrentDirectoryEntries(): RemoteFileEntry[] {
    const listing = listings[selectedPath]
    if (!listing) return []

    return [...listing.entries].sort((a, b) => {
      const aPinned = a.kind === 'directory' && isPinnedFolder(a.path)
      const bPinned = b.kind === 'directory' && isPinnedFolder(b.path)
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }

  function viewerEntryKindLabel(entry: RemoteFileEntry): string {
    if (entry.kind === 'directory') return 'Folder'
    return filePresentation(entry.name).title
  }

  function clearActionFeedback(): void {
    actionError = ''
    lastActionMessage = ''
  }

  async function refreshDirectory(directoryPath = currentDirectoryPath): Promise<void> {
    const setBusy = actionBusy === null
    const directory = normalizeRemotePath(directoryPath)
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

  function openCreateDialog(directoryPath = currentDirectoryPath): void {
    if (actionsDisabled) return
    createTargetDirectory = normalizeRemotePath(directoryPath)
    folderNameDraft = ''
    createDialogOpen = true
  }

  async function createFolder(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const folderPath = joinRemotePath(createTargetDirectory, folderNameDraft)
    if (!folderNameDraft.trim() || actionBusy !== null) return

    clearActionFeedback()
    actionBusy = 'create'
    try {
      await createRemoteDirectory(folderPath)
      await refreshDirectory(createTargetDirectory)
      folderNameDraft = ''
      createDialogOpen = false
      lastActionMessage = `Created remote folder ${folderPath}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function requestFileUpload(directoryPath = currentDirectoryPath): void {
    if (actionsDisabled) return
    uploadTargetDirectory = normalizeRemotePath(directoryPath)
    fileInputElement?.click()
  }

  async function handleFileInput(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    if (!input.files?.length) return
    await uploadFiles(input.files, uploadTargetDirectory)
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
    await uploadFiles(files, currentDirectoryPath)
  }

  async function uploadFiles(files: FileList | File[], directoryPath = currentDirectoryPath): Promise<void> {
    const queuedFiles = Array.from(files)
    const directory = normalizeRemotePath(directoryPath)
    if (!queuedFiles.length || actionBusy !== null) return

    clearActionFeedback()
    actionBusy = 'upload'
    try {
      for (const file of queuedFiles) {
        await uploadRemoteFile({
          file,
          fileName: file.name,
          overwrite: true,
          path: joinRemotePath(directory, file.name)
        })
      }
      await refreshDirectory(directory)
      lastActionMessage = `Uploaded ${queuedFiles.length} file${queuedFiles.length === 1 ? '' : 's'} to ${directory}`
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

  async function downloadFile(entry: RemoteFileEntry): Promise<void> {
    if (entry.kind !== 'file' || actionBusy !== null) return

    clearActionFeedback()
    actionBusy = 'download'
    try {
      const download = await readRemoteManagedFileDataUrl(entry.path)
      triggerBrowserDownload(download)
      lastActionMessage = `Prepared download for ${download.path}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function requestDeletePath(entry = selectedActionEntry()): void {
    if (actionsDisabled || entry.path === '/') return
    deleteTarget = entry
    deleteDialogOpen = true
  }

  async function confirmDeleteSelectedPath(): Promise<void> {
    const target = deleteTarget ?? selectedActionEntry()
    if (actionsDisabled || target.path === '/') return

    const deletedPath = target.path
    const deletedKind = target.kind
    const nextDirectory = parentDirectory(deletedPath)
    clearActionFeedback()
    actionBusy = 'delete'

    try {
      await deleteRemotePath(deletedPath, { recursive: deletedKind === 'directory' })
      const nextListings = { ...listings }
      delete nextListings[deletedPath]
      listings = nextListings
      expanded = { ...expanded, [deletedPath]: false }
      selectedFile = null
      selectedPath = nextDirectory
      locationDraft = nextDirectory
      if (deletedKind === 'directory') removePinnedFolderTree(deletedPath)
      await refreshDirectory(nextDirectory)
      deleteDialogOpen = false
      deleteTarget = null
      lastActionMessage = `Deleted remote ${deletedKind} ${deletedPath}`
    } catch (error) {
      actionError = messageForError(error)
    } finally {
      actionBusy = null
    }
  }

  function treeIconFor(entry: RemoteFileEntry): IconName {
    if (entry.kind === 'directory') return 'folder'
    return filePresentation(entry.name).icon
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

  function viewerEntryRowClass(entry: RemoteFileEntry): string {
    const pinned = entry.kind === 'directory' && isPinnedFolder(entry.path)
    const base =
      'grid min-h-9 w-full grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 border-b border-line/50 px-3 py-1.5 text-left text-[0.75rem] focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-[-2px]'
    const color = pinned
      ? 'bg-primary/10 text-primary hover:bg-primary/15'
      : 'text-ink-muted hover:bg-surface-raised hover:text-ink-bright'

    return `${base} ${color}`
  }
</script>

{#snippet treePanelContent()}
    {#if pinnedFolderEntries.length > 0}
      <div class="mb-2 grid gap-1 rounded-control border border-line/70 bg-surface-muted/30 p-2" aria-label="Pinned folders">
        <p class="font-hud text-[0.58rem] uppercase tracking-[0.16em] text-ink-faint">Pinned</p>
        <div class="grid gap-1">
          {#each pinnedFolderEntries as folder (folder.path)}
            <div class="flex min-w-0 items-center gap-1">
              <button
                type="button"
                class="flex min-h-6 min-w-0 flex-1 items-center gap-1 rounded-control border border-transparent px-1.5 text-left text-[0.72rem] text-ink-muted hover:border-line hover:bg-surface-raised hover:text-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
                title={folder.path}
                onclick={() => void openDirectory(folder.path)}
              >
                <Icon name="pin" class="text-primary" />
                <span class="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-transparent text-[0.65rem] text-ink-faint hover:border-line hover:bg-surface-raised hover:text-danger focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
                title={`Unpin ${folder.path}`}
                aria-label={`Unpin ${folder.path}`}
                onclick={() => togglePinnedFolder(folder.path)}
              >
                <Icon name="close" class="text-sm" />
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}

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
      class="min-h-0 flex-1 overflow-auto rounded-control border border-transparent p-1"
      data-selectable="true"
      aria-label="Remote file tree"
      role="region"
      ondragover={allowUploadDrop}
      ondrop={(event) => void handleDropUpload(event)}
    >
      {#each treeRows as row (row.entry.path)}
        <ContextMenu.Root>
          <ContextMenu.Trigger class="block">
            {#if row.entry.kind === 'directory'}
              <button
                type="button"
                class={rowClass(row)}
                style={rowStyle(row.depth)}
                aria-expanded={row.expanded}
                aria-current={row.entry.path === selectedPath ? 'true' : undefined}
                onclick={() => selectTreeRow(row)}
                oncontextmenu={() => focusRemoteEntry(row.entry)}
              >
                <Icon name={row.expanded ? 'chevronDown' : 'chevronRight'} class="w-3 text-center text-[0.6rem] text-line-strong" />
                <Icon name="folder" class="w-3.5 text-center text-secondary" />
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
                oncontextmenu={() => focusRemoteEntry(row.entry)}
              >
                <span class="w-3 text-center text-[0.6rem] text-line-strong"></span>
                <Icon name={treeIconFor(row.entry)} class="w-3.5 text-center text-warning" />
                <span class="min-w-0 flex-1 truncate">{row.entry.name}</span>
              </button>
            {/if}
          </ContextMenu.Trigger>

          <ContextMenu.Content class={contextMenuContentClass} sideOffset={4}>
            {#if row.entry.kind === 'directory'}
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => void openDirectory(row.entry.path)} disabled={actionsDisabled}>
                <span>open folder</span>
                <span class={contextMenuShortcutClass}>open</span>
              </ContextMenu.Item>
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => toggleTreeRow(row)} disabled={actionsDisabled}>
                <span>{row.expanded ? 'collapse' : 'expand'}</span>
                <span class={contextMenuShortcutClass}>{row.expanded ? 'hide' : 'show'}</span>
              </ContextMenu.Item>
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => void refreshDirectory(row.entry.path)} disabled={actionsDisabled}>
                <span>refresh</span>
                <span class={contextMenuShortcutClass}>sync</span>
              </ContextMenu.Item>
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => togglePinnedFolder(row.entry.path)} disabled={actionsDisabled}>
                <span>{isPinnedFolder(row.entry.path) ? 'unpin folder' : 'pin folder'}</span>
                <Icon name="pin" class={contextMenuShortcutClass} />
              </ContextMenu.Item>

              <ContextMenu.Separator class={contextMenuSeparatorClass} />

              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => openCreateDialog(row.entry.path)} disabled={actionsDisabled}>
                <span>new folder</span>
                <span class={contextMenuShortcutClass}>mkdir</span>
              </ContextMenu.Item>
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => requestFileUpload(row.entry.path)} disabled={actionsDisabled}>
                <span>upload files</span>
                <span class={contextMenuShortcutClass}>put</span>
              </ContextMenu.Item>

              <ContextMenu.Separator class={contextMenuSeparatorClass} />

              <ContextMenu.Item
                class={dangerContextMenuItemClass}
                onSelect={() => requestDeletePath(row.entry)}
                disabled={actionsDisabled || row.entry.path === '/'}
              >
                <span>delete folder</span>
                <span class="text-[10px] text-danger/80">rm -r</span>
              </ContextMenu.Item>
            {:else}
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => selectFile(row.entry)} disabled={actionsDisabled}>
                <span>preview</span>
                <span class={contextMenuShortcutClass}>open</span>
              </ContextMenu.Item>
              <ContextMenu.Item class={contextMenuItemClass} onSelect={() => void downloadFile(row.entry)} disabled={actionsDisabled}>
                <span>download</span>
                <span class={contextMenuShortcutClass}>get</span>
              </ContextMenu.Item>

              <ContextMenu.Separator class={contextMenuSeparatorClass} />

              <ContextMenu.Item class={dangerContextMenuItemClass} onSelect={() => requestDeletePath(row.entry)} disabled={actionsDisabled}>
                <span>delete file</span>
                <span class="text-[10px] text-danger/80">rm</span>
              </ContextMenu.Item>
            {/if}
          </ContextMenu.Content>
        </ContextMenu.Root>
      {/each}
    </div>

{/snippet}

<section
  class="flex h-full min-h-0 flex-col gap-3 bg-chat-scroll/40 p-3 md:grid md:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] md:p-4"
  aria-label="Remote assets browser"
>
  <input
    bind:this={fileInputElement}
    class="hidden"
    type="file"
    multiple
    onchange={(event) => void handleFileInput(event)}
    aria-label="Upload remote files"
  />

  <aside id="assets-tree-panel" class="hidden min-h-0 min-w-0 md:block" aria-label="Assets tree panel">
    <Panel title="Tree" padded={false} contentClass="flex min-h-0 flex-col p-2" class="h-full min-w-0">
      {@render treePanelContent()}
    </Panel>
  </aside>

  <Panel title="Viewer" padded={false} contentClass="flex min-h-0 flex-col p-3" class="min-w-0 flex-1">
    <form class="mb-3 border-b border-line pt-2 pb-3" onsubmit={applyLocationDraft}>
      <div class="flex items-center gap-2">
        <input
          bind:value={locationDraft}
          class="min-h-9 min-w-0 flex-1 rounded-control border border-line bg-canvas px-2 py-1.5 font-mono text-[0.78rem] leading-5 text-ink-bright outline-none focus:border-primary/70"
          aria-label="Remote location"
          autocomplete="off"
          spellcheck="false"
          disabled={actionsDisabled}
        />
        <div class="flex min-h-9 shrink-0 items-center gap-1" aria-label="Location navigation">
          <Button
            type="button"
            size="icon"
            chrome="ghost"
            aria-label="Back"
            title="Back"
            onclick={navigateBack}
            disabled={actionsDisabled || !canNavigateBack}
          >
            <Icon name="arrowLeft" />
          </Button>
          <Button
            type="button"
            size="icon"
            chrome="ghost"
            aria-label="Forward"
            title="Forward"
            onclick={navigateForward}
            disabled={actionsDisabled || !canNavigateForward}
          >
            <Icon name="arrowRight" />
          </Button>
          <Button
            type="button"
            size="icon"
            chrome="ghost"
            aria-label="Up one level"
            title="Up one level"
            onclick={navigateUp}
            disabled={actionsDisabled || !canNavigateUp}
          >
            <Icon name="arrowUp" />
          </Button>
          <Button
            type="button"
            size="icon"
            chrome="ghost"
            aria-label="Download selected file"
            title={selectedFile ? `Download ${selectedFile.name}` : 'Download selected file'}
            onclick={downloadCurrentFile}
            disabled={!canDownloadCurrentFile}
          >
            <Icon name="download" />
          </Button>
        </div>
      </div>
    </form>

    {#if !selectedFile || !selectedFilePresentation}
      <div class="min-h-0 flex-1 overflow-hidden rounded-panel border border-line bg-canvas/55">
        {#if selectedLoading}
          <div class="flex h-full items-center justify-center text-[0.72rem] uppercase tracking-[0.18em] text-primary">
            Loading folder contents…
          </div>
        {:else if selectedError}
          <div class="m-3 rounded-panel border border-danger/40 bg-danger/10 p-4 text-sm leading-6 text-danger" role="alert">
            Folder contents unavailable: {selectedError}
          </div>
        {:else if currentFolderEntries.length === 0}
          <div class="flex h-full items-center justify-center p-6 text-center text-sm leading-6 text-ink-muted">
            This remote folder is empty.
          </div>
        {:else}
          <div class="grid h-full grid-rows-[auto_minmax(0,1fr)]" role="table" aria-label="Folder contents">
            <div
              class="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 border-b border-line bg-surface-muted/40 px-3 py-2 font-hud text-[0.58rem] uppercase tracking-[0.16em] text-ink-faint"
              role="row"
            >
              <span role="columnheader">Name</span>
              <span role="columnheader">Kind</span>
            </div>
            <div class="min-h-0 overflow-auto" data-selectable="true">
              {#each currentFolderEntries as entry (entry.path)}
                <ContextMenu.Root>
                  <ContextMenu.Trigger class="block">
                    <button
                      type="button"
                      class={viewerEntryRowClass(entry)}
                      title={entry.path}
                      role="row"
                      onclick={() => void openViewerEntry(entry)}
                      oncontextmenu={() => focusRemoteEntry(entry)}
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        {#if entry.kind === 'directory'}
                          <Icon name="folder" class="w-8 text-secondary" />
                          {#if isPinnedFolder(entry.path)}
                            <Icon name="pin" label="Pinned folder" decorative={false} class="text-primary" />
                          {/if}
                        {:else}
                          <Icon name={treeIconFor(entry)} class="w-8 text-warning" />
                        {/if}
                        <span class="min-w-0 truncate">{entry.name}</span>
                      </span>
                      <span class="truncate text-ink-muted">{viewerEntryKindLabel(entry)}</span>
                    </button>
                  </ContextMenu.Trigger>

                  <ContextMenu.Content class={contextMenuContentClass} sideOffset={4}>
                    {#if entry.kind === 'directory'}
                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => void openDirectory(entry.path)} disabled={actionsDisabled}>
                        <span>open folder</span>
                        <span class={contextMenuShortcutClass}>open</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => togglePinnedFolder(entry.path)} disabled={actionsDisabled}>
                        <span>{isPinnedFolder(entry.path) ? 'unpin folder' : 'pin folder'}</span>
                        <Icon name="pin" class={contextMenuShortcutClass} />
                      </ContextMenu.Item>
                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => void refreshDirectory(entry.path)} disabled={actionsDisabled}>
                        <span>refresh</span>
                        <span class={contextMenuShortcutClass}>sync</span>
                      </ContextMenu.Item>

                      <ContextMenu.Separator class={contextMenuSeparatorClass} />

                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => openCreateDialog(entry.path)} disabled={actionsDisabled}>
                        <span>new folder</span>
                        <span class={contextMenuShortcutClass}>mkdir</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => requestFileUpload(entry.path)} disabled={actionsDisabled}>
                        <span>upload files</span>
                        <span class={contextMenuShortcutClass}>put</span>
                      </ContextMenu.Item>

                      <ContextMenu.Separator class={contextMenuSeparatorClass} />

                      <ContextMenu.Item class={dangerContextMenuItemClass} onSelect={() => requestDeletePath(entry)} disabled={actionsDisabled}>
                        <span>delete folder</span>
                        <span class="text-[10px] text-danger/80">rm -r</span>
                      </ContextMenu.Item>
                    {:else}
                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => selectFile(entry)} disabled={actionsDisabled}>
                        <span>preview</span>
                        <span class={contextMenuShortcutClass}>open</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item class={contextMenuItemClass} onSelect={() => void downloadFile(entry)} disabled={actionsDisabled}>
                        <span>download</span>
                        <span class={contextMenuShortcutClass}>get</span>
                      </ContextMenu.Item>

                      <ContextMenu.Separator class={contextMenuSeparatorClass} />

                      <ContextMenu.Item class={dangerContextMenuItemClass} onSelect={() => requestDeletePath(entry)} disabled={actionsDisabled}>
                        <span>delete file</span>
                        <span class="text-[10px] text-danger/80">rm</span>
                      </ContextMenu.Item>
                    {/if}
                  </ContextMenu.Content>
                </ContextMenu.Root>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="mb-3 flex min-h-0 items-start gap-3 border-b border-line pb-3">
        <span class={thumbnailClass(selectedFilePresentation.accent)} style="width: 5rem; min-width: 5rem; height: 4rem">
          {#if selectedViewerKind === 'image' && dataPreviewUrl}
            <img src={dataPreviewUrl} alt="" class="h-full w-full object-cover" />
          {:else}
            <Icon name={selectedFilePresentation.icon} label={selectedFilePresentation.title} decorative={false} />
          {/if}
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-ink-bright" title={selectedFile.name}>{selectedFile.name}</h2>
          <p class="truncate font-mono text-[0.66rem] text-ink-muted" title={selectedFile.path}>{selectedFile.path}</p>
          <p class="mt-1 text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">
            {selectedFilePresentation.title} · {selectedFile.mimeType ?? 'remote file'}
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
            <Icon name="fileAudio" label="Audio" decorative={false} class="text-4xl text-success" />
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

<Dialog bind:open={createDialogOpen} title="Create remote folder" description={`Parent ${createTargetDirectory}`}>
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
      Target path: {joinRemotePath(createTargetDirectory, folderNameDraft || 'new-folder')}
    </div>
    <div class="flex justify-end gap-2">
      <Button size="sm" chrome="ghost" onclick={() => (createDialogOpen = false)} disabled={actionsDisabled}>Cancel</Button>
      <Button type="submit" size="sm" variant="secondary" disabled={actionsDisabled || !folderNameDraft.trim()}>Create folder</Button>
    </div>
  </form>
</Dialog>

<Dialog bind:open={deleteDialogOpen} title="Delete remote path" description="Remote filesystem confirmation">
  <div class="grid gap-3 p-3 text-sm leading-6 text-ink-muted">
    <p>This cannot be undone.</p>
    <p>
      Delete the remote {deleteActionKind}?
    </p>
    <code class="rounded-control border border-danger/35 bg-danger/10 p-2 font-mono text-[0.72rem] text-danger" data-selectable="true">
      {deleteActionPath}
    </code>
    <div class="flex justify-end gap-2">
      <Button size="sm" chrome="ghost" onclick={() => { deleteDialogOpen = false; deleteTarget = null }} disabled={actionsDisabled}>Cancel</Button>
      <Button size="sm" variant="danger" onclick={() => void confirmDeleteSelectedPath()} disabled={deleteDisabled}>
        Delete remote path
      </Button>
    </div>
  </div>
</Dialog>
