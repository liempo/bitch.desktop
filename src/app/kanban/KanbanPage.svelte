<script lang="ts">
  import { onMount } from 'svelte'
  import { Popover } from 'bits-ui'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { menuItemClass, popoverClass } from '@/app/components/ui/styles'
  import {
    addKanbanComment,
    getKanbanBoard,
    getKanbanTask,
    kanbanDisplayStatus,
    listKanbanBoards,
    updateKanbanTaskStatus,
    type KanbanBoardMeta,
    type KanbanColumn,
    type KanbanStatus,
    type KanbanTask,
    type KanbanTaskDetailResponse
  } from '$lib/hermes/kanban'
  import KanbanCardDetailsPanel from './KanbanCardDetailsPanel.svelte'
  import { messageForError } from '$lib/errors'
  import { ensureGatewayProfile, profileState } from '$lib/hermes/profiles'

  const DIRECT_DROP_STATUSES = new Set<string>(['triage', 'todo', 'scheduled', 'ready', 'review', 'blocked', 'done', 'archived'])
  const COLUMN_LABELS: Record<string, string> = {
    triage: 'Triage',
    todo: 'Todo',
    scheduled: 'Scheduled',
    ready: 'Ready',
    running: 'Running',
    review: 'Review',
    blocked: 'Blocked',
    done: 'Done',
    archived: 'Archived'
  }

  const pillClass = 'inline-block max-w-36 truncate rounded-none border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[0.58rem] text-ink-muted sm:max-w-48'
  const cardMetaClass = 'inline-block max-w-48 truncate rounded-none border border-line/70 bg-canvas px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-ink-faint'
  const columnHeaderClass = [
    'flex w-full items-center justify-between gap-3 border-b border-line bg-transparent px-2 py-2 text-left',
    'transition-colors hover:bg-surface-raised/45 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
  ].join(' ')
  const headerSelectorTriggerClass = [
    'inline-block max-w-20 truncate align-middle sm:max-w-28 md:max-w-36',
    'font-mono text-[10px] font-bold uppercase tracking-[0.05em]',
    'text-ink-muted hover:text-ink-bright',
    "before:mr-1 before:text-line-strong before:content-['['] after:ml-1 after:text-line-strong after:content-[']']",
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-ink-muted'
  ].join(' ')
  const filterMenuContentClass = `${popoverClass} z-50 w-64 p-1.5 font-mono`
  const filterMenuItemClass = `${menuItemClass} flex w-full items-start justify-between gap-2 px-2 py-1.5 text-left text-[11px] uppercase tracking-[0.08em]`

  let selectedProfile = $state('default')
  let boards = $state<KanbanBoardMeta[]>([])
  let selectedBoard = $state('')
  let tenantFilter = $state('')
  let columns = $state<KanbanColumn[]>([])
  let tenants = $state<string[]>([])
  let boardNow = $state(0)
  let loadingBoards = $state(false)
  let loadingBoard = $state(false)
  let loadingDetail = $state(false)
  let detailDialogOpen = $state(false)
  let error = $state('')
  let actionError = $state('')
  let selectedTaskId = $state<string | null>(null)
  let selectedTaskDetail = $state<KanbanTaskDetailResponse | null>(null)
  let draggedTaskId = $state<string | null>(null)
  let draggedTaskStatus = $state<string | null>(null)
  let collapsedColumns = $state<Record<string, boolean>>({})
  let newComment = $state('')
  let commentSaving = $state(false)
  let profileMenuOpen = $state(false)
  let boardMenuOpen = $state(false)
  let tenantMenuOpen = $state(false)

  const activeProfile = $derived(selectedProfile || profileState.activeGatewayProfile || 'default')
  const selectedBoardMeta = $derived.by(() => boards.find(board => board.slug === selectedBoard) ?? null)
  const visibleTaskCount = $derived.by(() => columns.reduce((total, column) => total + column.tasks.length, 0))
  const profileOptions = $derived.by(() => {
    const names = new Set<string>([profileState.activeGatewayProfile || 'default', selectedProfile || 'default'])
    for (const profile of profileState.profiles) names.add(profile.name)
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b))
  })
  const selectedProfileLabel = $derived(selectedProfile || 'default')
  const selectedBoardLabel = $derived(selectedBoardMeta?.name || selectedBoard || 'no board')
  const selectedTenantLabel = $derived(tenantFilter || 'all tenants')
  const selectedTaskDialogTitle = $derived(selectedTaskDetail?.task.title || selectedTaskId || 'Card detail')
  const selectedTaskDialogDescription = $derived(selectedTaskDetail?.task.id || selectedTaskId || '')
  const kanbanShellClass = $derived(
    selectedTaskId ? 'grid h-full min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]' : 'grid h-full min-h-0 gap-3'
  )

  onMount(() => {
    selectedProfile = profileState.activeGatewayProfile || 'default'
    void loadKanbanBoards()

    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const handleViewportChange = () => {
      if (mediaQuery.matches) detailDialogOpen = false
    }

    handleViewportChange()
    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  })

  $effect(() => {
    if (!selectedTaskId) detailDialogOpen = false
  })

  $effect(() => {
    if (selectedTaskId && !detailDialogOpen && !isDesktopViewport()) clearTaskDetails()
  })

  function statusLabel(status: string): string {
    const displayStatus = kanbanDisplayStatus(status)
    return COLUMN_LABELS[displayStatus] ?? String(displayStatus).replace(/[_-]/g, ' ')
  }

  function statusTone(status: string): string {
    switch (kanbanDisplayStatus(status)) {
      case 'running':
        return 'border-primary/40 bg-primary/10 text-primary'
      case 'review':
        return 'border-secondary/40 bg-secondary/10 text-secondary'
      case 'blocked':
        return 'border-danger/40 bg-danger/10 text-danger'
      case 'done':
        return 'border-success/40 bg-success/10 text-success'
      case 'scheduled':
        return 'border-secondary/40 bg-secondary/10 text-secondary'
      default:
        return 'border-line bg-surface-raised text-ink-muted'
    }
  }

  function taskCardClass(task: KanbanTask): string {
    const base = 'border transition-colors'
    const displayStatus = kanbanDisplayStatus(task.status)
    const selected = selectedTaskId === task.id ? 'ring-1 ring-primary/60' : ''
    if (displayStatus === 'blocked') return `${base} border-danger/35 bg-danger/10 ${selected}`
    if (displayStatus === 'running') return `${base} border-primary/35 bg-primary/5 ${selected}`
    return `${base} border-line bg-canvas ${selected}`
  }

  function isColumnOpen(columnName: string): boolean {
    return collapsedColumns[columnName] !== true
  }

  function toggleColumn(columnName: string): void {
    collapsedColumns = { ...collapsedColumns, [columnName]: isColumnOpen(columnName) }
  }

  function markerForTask(task: KanbanTask): string {
    const displayStatus = kanbanDisplayStatus(task.status)
    if (displayStatus === 'running') {
      const stale = typeof task.last_heartbeat_at === 'number' && boardNow > 0 && boardNow - task.last_heartbeat_at > 60 * 60
      if (stale) return 'stale worker'
    }
    if (task.warnings?.count) return `${task.warnings.count} diagnostics`
    if (task.progress) return `${task.progress.done}/${task.progress.total} children`
    return ''
  }

  function markerClass(task: KanbanTask): string {
    const marker = markerForTask(task)
    if (marker.includes('stale')) return 'border-danger/40 bg-danger/10 text-danger'
    if (marker.includes('diagnostics')) return 'border-warning/40 bg-warning/10 text-warning'
    return 'border-line bg-canvas text-ink-muted'
  }

  function formatAge(seconds: null | number | undefined): string {
    if (typeof seconds !== 'number' || seconds < 0) return '—'
    if (seconds < 60) return `${Math.floor(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  function profileContext(): string {
    return activeProfile || 'default'
  }

  function isDesktopViewport(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  }

  function clearTaskDetails(): void {
    selectedTaskId = null
    selectedTaskDetail = null
    newComment = ''
    loadingDetail = false
    detailDialogOpen = false
  }

  function taskSummary(task: KanbanTask): string {
    return task.latest_summary?.trim() || task.body?.trim() || 'No description supplied.'
  }

  async function loadKanbanBoards(): Promise<void> {
    loadingBoards = true
    error = ''
    actionError = ''

    try {
      await ensureGatewayProfile(profileContext())
      const response = await listKanbanBoards(profileContext())
      boards = response.boards
      selectedBoard = selectedBoard || response.current || boards[0]?.slug || 'default'
      await loadKanbanBoard()
    } catch (loadError) {
      error = messageForError(loadError)
    } finally {
      loadingBoards = false
    }
  }

  async function loadKanbanBoard(): Promise<void> {
    if (!selectedBoard) selectedBoard = boards[0]?.slug || 'default'
    loadingBoard = true
    error = ''
    actionError = ''

    try {
      const response = await getKanbanBoard({
        board: selectedBoard,
        profile: profileContext(),
        tenant: tenantFilter || null
      })
      columns = response.columns
      tenants = response.tenants
      boardNow = response.now
      if (selectedTaskId) await loadSelectedTaskDetail()
    } catch (loadError) {
      error = messageForError(loadError)
    } finally {
      loadingBoard = false
    }
  }

  async function loadSelectedTaskDetail(): Promise<void> {
    const taskId = selectedTaskId
    if (!taskId) return
    loadingDetail = true

    try {
      const detail = await getKanbanTask(taskId, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })
      if (selectedTaskId === taskId) selectedTaskDetail = detail
    } catch (loadError) {
      if (selectedTaskId === taskId) actionError = messageForError(loadError)
    } finally {
      if (selectedTaskId === taskId) loadingDetail = false
    }
  }

  async function selectTask(task: KanbanTask): Promise<void> {
    selectedTaskId = task.id
    selectedTaskDetail = null
    newComment = ''
    actionError = ''
    if (!isDesktopViewport()) detailDialogOpen = true
    await loadSelectedTaskDetail()
  }

  function handleColumnDragOver(event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  function handleDragStart(event: DragEvent, task: KanbanTask): void {
    draggedTaskId = task.id
    draggedTaskStatus = task.status
    event.dataTransfer?.setData('text/plain', task.id)
    event.dataTransfer?.setData('application/x-kanban-status', task.status)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd(): void {
    draggedTaskId = null
    draggedTaskStatus = null
  }

  async function handleDrop(event: DragEvent, status: string): Promise<void> {
    event.preventDefault()
    const taskId = event.dataTransfer?.getData('text/plain') || draggedTaskId
    const fromStatus = event.dataTransfer?.getData('application/x-kanban-status') || draggedTaskStatus
    draggedTaskId = null
    draggedTaskStatus = null
    actionError = ''

    if (!taskId || fromStatus === status) return
    if (!DIRECT_DROP_STATUSES.has(status)) {
      actionError = `Status ${statusLabel(status)} is controlled by the dispatcher and cannot be set directly.`
      return
    }

    try {
      await updateKanbanTaskStatus(taskId, status as KanbanStatus, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })
      selectedTaskId = taskId
      selectedTaskDetail = null
      await loadKanbanBoard()
    } catch (updateError) {
      actionError = messageForError(updateError)
    }
  }

  async function selectProfileOption(profile: string): Promise<void> {
    selectedProfile = profile || 'default'
    profileMenuOpen = false
    clearTaskDetails()
    await loadKanbanBoards()
  }

  async function selectBoardOption(board: KanbanBoardMeta): Promise<void> {
    selectedBoard = board.slug
    boardMenuOpen = false
    clearTaskDetails()
    await loadKanbanBoard()
  }

  async function selectTenantOption(tenant: string): Promise<void> {
    tenantFilter = tenant
    tenantMenuOpen = false
    clearTaskDetails()
    await loadKanbanBoard()
  }

  async function submitComment(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const body = newComment.trim()
    if (!selectedTaskId || !body) return
    commentSaving = true
    actionError = ''

    try {
      await addKanbanComment(selectedTaskId, body, { author: 'desktop', board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })
      newComment = ''
      await loadSelectedTaskDetail()
      await loadKanbanBoard()
    } catch (commentError) {
      actionError = messageForError(commentError)
    } finally {
      commentSaving = false
    }
  }

</script>

<section
  class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-chat-scroll/40 p-3 md:overflow-hidden md:p-4"
  aria-label="Kanban board"
>


  {#if error}
    <div class="rounded-panel border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">
      Kanban route failed: {error}
    </div>
  {/if}

  {#if actionError}
    <div class="rounded-panel border border-warning/40 bg-warning/10 p-3 text-sm leading-6 text-warning" role="alert">
      {actionError}
    </div>
  {/if}

  <div class={kanbanShellClass}>
    <Panel
      title="Cards"
      badge={loadingBoard ? 'SYNC' : `${visibleTaskCount}`}
      padded={false}
      class="min-h-112 md:min-h-0"
      contentClass="flex min-h-0 flex-col overflow-hidden p-1"
    >
      {#snippet actions()}
        <Popover.Root bind:open={profileMenuOpen}>
          <Popover.Trigger class={headerSelectorTriggerClass} aria-label={`Choose Kanban remote profile. Current profile: ${selectedProfileLabel}`}>
            PROFILE
          </Popover.Trigger>
          <Popover.Content class={filterMenuContentClass} sideOffset={4} align="end">
            <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">remote profiles</div>
            <div class="grid gap-1">
              {#each profileOptions as profile}
                <button class={filterMenuItemClass} type="button" onclick={() => void selectProfileOption(profile)} aria-pressed={profile === selectedProfile}>
                  <span class="min-w-0 truncate">profile:{profile}</span>
                  {#if profile === selectedProfile}<span class="shrink-0 text-primary">active</span>{/if}
                </button>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Root>

        <Popover.Root bind:open={boardMenuOpen}>
          <Popover.Trigger class={headerSelectorTriggerClass} disabled={loadingBoards || boards.length === 0} aria-label={`Choose Kanban board. Current board: ${selectedBoardLabel}`}>
            BOARD
          </Popover.Trigger>
          <Popover.Content class={filterMenuContentClass} sideOffset={4} align="end">
            <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">available boards</div>
            {#if loadingBoards}
              <div class="px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-muted">syncing boards…</div>
            {:else if boards.length === 0}
              <div class="px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-muted">no boards reported</div>
            {:else}
              <div class="grid gap-1">
                {#each boards as board}
                  <button class={filterMenuItemClass} type="button" onclick={() => void selectBoardOption(board)} aria-pressed={board.slug === selectedBoard}>
                    <span class="min-w-0">
                      <span class="block truncate">board:{board.name || board.slug}</span>
                      <span class="mt-0.5 block truncate text-[10px] text-ink-muted/80">{board.slug} · {board.total ?? 0} cards</span>
                    </span>
                    {#if board.slug === selectedBoard}<span class="shrink-0 text-primary">current</span>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          </Popover.Content>
        </Popover.Root>

        <Popover.Root bind:open={tenantMenuOpen}>
          <Popover.Trigger class={headerSelectorTriggerClass} aria-label={`Choose Kanban tenant. Current tenant: ${selectedTenantLabel}`}>
            TENANT
          </Popover.Trigger>
          <Popover.Content class={filterMenuContentClass} sideOffset={4} align="end">
            <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">tenants</div>
            <div class="grid gap-1">
              <button class={filterMenuItemClass} type="button" onclick={() => void selectTenantOption('')} aria-pressed={tenantFilter === ''}>
                <span class="min-w-0 truncate">tenant:all tenants</span>
                {#if tenantFilter === ''}<span class="shrink-0 text-primary">active</span>{/if}
              </button>
              {#each tenants as tenant}
                <button class={filterMenuItemClass} type="button" onclick={() => void selectTenantOption(tenant)} aria-pressed={tenant === tenantFilter}>
                  <span class="min-w-0 truncate">tenant:{tenant}</span>
                  {#if tenant === tenantFilter}<span class="shrink-0 text-primary">active</span>{/if}
                </button>
              {/each}
            </div>
          </Popover.Content>
        </Popover.Root>
      {/snippet}

      {#if loadingBoard && columns.length === 0}
        <div class="flex h-full items-center justify-center font-hud text-[0.72rem] uppercase tracking-[0.18em] text-primary">
          Loading grouped cards…
        </div>
      {:else}
        <div class="min-h-0 flex-1 overflow-auto p-1" style="--custom-scrollbar-offset-x: 4px" data-selectable="true">
          <div class="grid gap-2">
            {#each columns as column (column.name)}
              {@const columnOpen = isColumnOpen(column.name)}
              <section
                class="grid gap-1"
                data-kanban-column={column.name}
                aria-label={`${statusLabel(column.name)} grouped cards`}
                ondragover={handleColumnDragOver}
                ondrop={event => handleDrop(event, column.name)}
              >
                <button class={columnHeaderClass} type="button" onclick={() => toggleColumn(column.name)} aria-expanded={columnOpen}>
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="w-3 shrink-0 font-mono text-[0.62rem] text-ink-faint" aria-hidden="true">{columnOpen ? '▾' : '▸'}</span>
                    <span class="min-w-0 truncate text-sm font-semibold uppercase tracking-[0.12em] text-ink-bright">{statusLabel(column.name)}</span>
                    <span class="hidden text-[0.62rem] uppercase tracking-[0.16em] text-ink-muted sm:inline">
                      {DIRECT_DROP_STATUSES.has(column.name) ? 'drop target' : 'dispatcher-owned'}
                    </span>
                  </span>
                  <span class={`shrink-0 rounded-control border px-2 py-1 font-mono text-[0.68rem] ${statusTone(column.name)}`}>{column.tasks.length}</span>
                </button>

                {#if columnOpen}
                  <div class="grid gap-1" role="list">
                    {#if column.tasks.length === 0}
                      <div class="border border-dashed border-line p-3 text-[0.68rem] text-ink-muted">
                        No cards in {statusLabel(column.name)}.
                      </div>
                    {:else}
                      {#each column.tasks as task (task.id)}
                        {@const marker = markerForTask(task)}
                        <div
                          class={taskCardClass(task)}
                          draggable="true"
                          role="listitem"
                          ondragstart={event => handleDragStart(event, task)}
                          ondragend={handleDragEnd}
                        >
                          <button
                            class="block w-full px-2 py-1.5 text-left transition-colors hover:bg-surface-raised/45 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
                            type="button"
                            onclick={() => selectTask(task)}
                            aria-label={`Show details for ${task.title}`}
                            aria-pressed={selectedTaskId === task.id}
                          >
                            <div class="min-w-0">
                              <div class="truncate text-[0.76rem] font-semibold text-ink-bright" title={task.title}>{task.title}</div>
                              <p class="line-clamp-3 text-[0.62rem] leading-4 text-ink-muted wrap-anywhere" title={taskSummary(task)}>{taskSummary(task)}</p>
                            </div>
                          </button>

                          <footer class="grid gap-1.5 border-t border-line/50 bg-surface-raised/25 px-2 py-1.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-2">
                            <div class="flex min-w-0 flex-wrap items-center gap-1">
                              <span class={cardMetaClass} title={`Card: ${task.id}`}>{task.id}</span>
                              {#if task.assignee}
                                <span class={pillClass} title={`Assignee: ${task.assignee}`}>@{task.assignee}</span>
                              {/if}
                              {#if task.tenant}
                                <span class={pillClass} title={`Tenant: ${task.tenant}`}>{task.tenant}</span>
                              {/if}
                              {#if marker}
                                <span class={`inline-block max-w-48 truncate rounded-none border px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] ${markerClass(task)}`} title={marker}>{marker}</span>
                              {/if}
                            </div>
                            <div class="flex min-w-0 flex-wrap gap-1 font-mono text-[0.62rem] text-ink-faint md:justify-end">
                              <span>priority {task.priority ?? 0}</span>
                              <span>age {formatAge(task.age?.created_age_seconds)}</span>
                            </div>
                          </footer>
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </section>
            {/each}
          </div>
        </div>
      {/if}
    </Panel>

    {#if selectedTaskId}
      <aside class="hidden min-h-0 md:block" aria-label="Kanban card details panel">
        <KanbanCardDetailsPanel
          class="min-h-128 md:min-h-0"
          detail={selectedTaskDetail}
          loading={loadingDetail}
          bind:comment={newComment}
          commentSaving={commentSaving}
          onClose={clearTaskDetails}
          onSubmitComment={submitComment}
        />
      </aside>
    {/if}
  </div>
</section>

{#if selectedTaskId}
  <Dialog
    bind:open={detailDialogOpen}
    title={selectedTaskDialogTitle}
    description={selectedTaskDialogDescription}
    class="w-[min(38rem,calc(100vw-2rem))] md:hidden"
    contentClass="flex max-h-[min(38rem,calc(100vh-7rem))] flex-col overflow-hidden"
  >
    <div class="min-h-0 flex-1 overflow-hidden p-3">
      <KanbanCardDetailsPanel
        detail={selectedTaskDetail}
        loading={loadingDetail}
        bind:comment={newComment}
        commentSaving={commentSaving}
        showIdentity={false}
        onSubmitComment={submitComment}
      />
    </div>
  </Dialog>
{/if}
