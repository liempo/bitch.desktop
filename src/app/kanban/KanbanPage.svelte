<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import { agentRoute } from '../router.svelte'
  import {
    addKanbanComment,
    getKanbanBoard,
    getKanbanTask,
    listKanbanBoards,
    updateKanbanTaskStatus,
    type KanbanBoardMeta,
    type KanbanColumn,
    type KanbanEvent,
    type KanbanStatus,
    type KanbanTask,
    type KanbanTaskDetailResponse
  } from '$lib/api/kanban'
  import { messageForError } from '$lib/errors'
  import { ensureGatewayProfile, profileState } from '$lib/stores/profile.svelte'

  const DIRECT_DROP_STATUSES = new Set<string>(['triage', 'todo', 'scheduled', 'ready', 'blocked', 'review', 'done', 'archived'])
  const COLUMN_LABELS: Record<string, string> = {
    triage: 'Triage',
    todo: 'Todo',
    scheduled: 'Scheduled',
    ready: 'Ready',
    running: 'Running',
    blocked: 'Blocked',
    review: 'Review',
    done: 'Done',
    archived: 'Archived'
  }

  let selectedProfile = $state('default')
  let boards = $state<KanbanBoardMeta[]>([])
  let selectedBoard = $state('')
  let tenantFilter = $state('')
  let columns = $state<KanbanColumn[]>([])
  let tenants = $state<string[]>([])
  let assignees = $state<string[]>([])
  let latestEventId = $state(0)
  let boardNow = $state(0)
  let loadingBoards = $state(false)
  let loadingBoard = $state(false)
  let loadingDetail = $state(false)
  let error = $state('')
  let actionError = $state('')
  let selectedTaskId = $state<string | null>(null)
  let selectedTaskDetail = $state<KanbanTaskDetailResponse | null>(null)
  let draggedTaskId = $state<string | null>(null)
  let draggedTaskStatus = $state<string | null>(null)
  let newComment = $state('')
  let commentSaving = $state(false)

  const activeProfile = $derived(selectedProfile || profileState.activeGatewayProfile || 'default')
  const selectedBoardMeta = $derived.by(() => boards.find(board => board.slug === selectedBoard) ?? null)
  const visibleTaskCount = $derived.by(() => columns.reduce((total, column) => total + column.tasks.length, 0))
  const profileOptions = $derived.by(() => {
    const names = new Set<string>([profileState.activeGatewayProfile || 'default', selectedProfile || 'default'])
    for (const profile of profileState.profiles) names.add(profile.name)
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b))
  })
  const selectedReferences = $derived.by(() => referenceMatches(selectedTaskDetail))

  onMount(() => {
    selectedProfile = profileState.activeGatewayProfile || 'default'
    void loadKanbanBoards()
  })

  function statusLabel(status: string): string {
    return COLUMN_LABELS[status] ?? status.replace(/[_-]/g, ' ')
  }

  function statusTone(status: string): string {
    switch (status) {
      case 'running':
        return 'border-primary/40 bg-primary/10 text-primary'
      case 'blocked':
        return 'border-danger/40 bg-danger/10 text-danger'
      case 'review':
        return 'border-warning/40 bg-warning/10 text-warning'
      case 'done':
        return 'border-success/40 bg-success/10 text-success'
      case 'scheduled':
        return 'border-secondary/40 bg-secondary/10 text-secondary'
      default:
        return 'border-line bg-surface-raised text-ink-muted'
    }
  }

  function cardClass(task: KanbanTask): string {
    const base =
      'w-full rounded-panel border p-3 text-left shadow-sm transition focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    const selected = selectedTaskId === task.id ? 'border-primary/70 bg-primary/10' : 'border-line bg-surface-raised/80'
    return `${base} ${selected} hover:border-line-strong hover:bg-surface-raised`
  }

  function markerForTask(task: KanbanTask): string {
    if (task.status === 'running') {
      const stale = typeof task.last_heartbeat_at === 'number' && boardNow > 0 && boardNow - task.last_heartbeat_at > 60 * 60
      return stale ? 'stale worker' : 'in progress'
    }
    if (task.status === 'blocked') return 'blocked'
    if (task.status === 'review') return 'review'
    if (task.warnings?.count) return `${task.warnings.count} diagnostics`
    if (task.progress) return `${task.progress.done}/${task.progress.total} children`
    return ''
  }

  function markerClass(task: KanbanTask): string {
    const marker = markerForTask(task)
    if (marker.includes('stale') || marker === 'blocked') return 'border-danger/40 bg-danger/10 text-danger'
    if (marker === 'review' || marker.includes('diagnostics')) return 'border-warning/40 bg-warning/10 text-warning'
    if (marker === 'in progress') return 'border-primary/40 bg-primary/10 text-primary'
    return 'border-line bg-canvas text-ink-muted'
  }

  function formatEpoch(value: null | number | undefined): string {
    if (typeof value !== 'number' || value <= 0) return '—'
    return new Date(value * 1000).toLocaleString()
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
      assignees = response.assignees
      latestEventId = response.latest_event_id
      boardNow = response.now
      if (selectedTaskId) await loadSelectedTaskDetail()
    } catch (loadError) {
      error = messageForError(loadError)
    } finally {
      loadingBoard = false
    }
  }

  async function loadSelectedTaskDetail(): Promise<void> {
    if (!selectedTaskId) return
    loadingDetail = true

    try {
      selectedTaskDetail = await getKanbanTask(selectedTaskId, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })
    } catch (loadError) {
      actionError = messageForError(loadError)
    } finally {
      loadingDetail = false
    }
  }

  async function selectTask(task: KanbanTask): Promise<void> {
    selectedTaskId = task.id
    selectedTaskDetail = null
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
      await loadKanbanBoard()
    } catch (updateError) {
      actionError = messageForError(updateError)
    }
  }

  async function handleProfileChange(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLSelectElement
    selectedProfile = target.value || 'default'
    selectedTaskId = null
    selectedTaskDetail = null
    await loadKanbanBoards()
  }

  async function handleBoardChange(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLSelectElement
    selectedBoard = target.value
    selectedTaskId = null
    selectedTaskDetail = null
    await loadKanbanBoard()
  }

  async function handleTenantChange(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLSelectElement
    tenantFilter = target.value
    selectedTaskId = null
    selectedTaskDetail = null
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

  function referenceMatches(detail: KanbanTaskDetailResponse | null): string[] {
    if (!detail) return []
    const text = [detail.task.body, detail.task.result, detail.task.latest_summary].filter(Boolean).join('\n')
    const matches = text.match(/https:\/\/github\.com\/[^\s)]+\/(?:pull|issues)\/\d+|(?:PR|issue)\s+#\d+/gi)
    return [...new Set(matches ?? [])]
  }

  function eventPayload(event: KanbanEvent): string {
    if (event.payload == null) return ''
    if (typeof event.payload === 'string') return event.payload
    try {
      return JSON.stringify(event.payload)
    } catch {
      return String(event.payload)
    }
  }
</script>

<section class="flex h-full min-h-0 flex-col gap-3 bg-chat-scroll/40 p-4" aria-label="Kanban board">
  <Panel title="Kanban Board" padded={false} fullHeight={false} contentClass="p-3" actions={boardActions}>
    <div class="grid gap-3 md:grid-cols-[minmax(10rem,14rem)_minmax(10rem,14rem)_minmax(10rem,14rem)_1fr]">
      <label class="flex flex-col gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">
        Remote profile
        <select class="rounded-control border border-line bg-canvas px-2 py-1 text-sm normal-case tracking-normal text-ink-bright" bind:value={selectedProfile} onchange={handleProfileChange}>
          {#each profileOptions as profile}
            <option value={profile}>{profile}</option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">
        Board
        <select class="rounded-control border border-line bg-canvas px-2 py-1 text-sm normal-case tracking-normal text-ink-bright" bind:value={selectedBoard} onchange={handleBoardChange} disabled={loadingBoards || boards.length === 0}>
          {#each boards as board}
            <option value={board.slug}>{board.name || board.slug}</option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">
        Tenant
        <select class="rounded-control border border-line bg-canvas px-2 py-1 text-sm normal-case tracking-normal text-ink-bright" bind:value={tenantFilter} onchange={handleTenantChange}>
          <option value="">All tenants</option>
          {#each tenants as tenant}
            <option value={tenant}>{tenant}</option>
          {/each}
        </select>
      </label>

      <div class="flex min-w-0 flex-col justify-end text-xs leading-5 text-ink-muted">
        <span class="min-w-0 overflow-hidden whitespace-nowrap">{selectedBoardMeta?.description || 'Hermes Kanban cards via authenticated dashboard plugin routes.'}</span>
        <span class="font-mono text-[0.68rem] text-ink-faint">
          profile={profileContext()} · board={selectedBoard || '—'} · tasks={visibleTaskCount} · assignees={assignees.length || '—'} · event={latestEventId || '—'}
        </span>
      </div>
    </div>
  </Panel>

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

  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-3">
    <Panel title="Columns" badge={loadingBoard ? 'SYNC' : `${visibleTaskCount}`} padded={false} contentClass="overflow-hidden p-3">
      {#if loadingBoard && columns.length === 0}
        <div class="flex h-full items-center justify-center font-hud text-[0.72rem] uppercase tracking-[0.18em] text-primary">
          Loading board lanes…
        </div>
      {:else}
        <div class="flex h-full min-h-0 gap-3 overflow-x-auto pb-2" data-selectable="true">
          {#each columns as column (column.name)}
            <section
              class="flex min-h-0 w-72 shrink-0 flex-col rounded-panel border border-line bg-canvas/45"
              data-kanban-column={column.name}
              role="list"
              aria-label={`${statusLabel(column.name)} cards`}
              ondragover={handleColumnDragOver}
              ondrop={event => handleDrop(event, column.name)}
            >
              <header class="flex items-center justify-between border-b border-line px-3 py-2">
                <div class="min-w-0">
                  <h2 class="min-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold uppercase tracking-[0.12em] text-ink-bright">{statusLabel(column.name)}</h2>
                  <p class="text-[0.62rem] uppercase tracking-[0.16em] text-ink-muted">
                    {DIRECT_DROP_STATUSES.has(column.name) ? 'drop enabled' : 'dispatcher-owned'}
                  </p>
                </div>
                <span class={`rounded-control border px-2 py-1 font-mono text-[0.68rem] ${statusTone(column.name)}`}>{column.tasks.length}</span>
              </header>

              <div class="min-h-0 flex-1 space-y-2 overflow-auto p-2">
                {#if column.tasks.length === 0}
                  <div class="rounded-panel border border-dashed border-line p-4 text-center text-xs leading-5 text-ink-muted">
                    No cards in {statusLabel(column.name)}.
                  </div>
                {:else}
                  {#each column.tasks as task (task.id)}
                    {@const marker = markerForTask(task)}
                    <button
                      type="button"
                      class={cardClass(task)}
                      draggable="true"
                      ondragstart={event => handleDragStart(event, task)}
                      ondragend={handleDragEnd}
                      onclick={() => selectTask(task)}
                      aria-current={selectedTaskId === task.id ? 'true' : undefined}
                    >
                      <div class="flex items-start justify-between gap-2">
                        <h3 class="min-w-0 flex-1 text-sm font-semibold leading-5 text-ink-bright">{task.title}</h3>
                        <span class="font-mono text-[0.62rem] text-ink-faint">{task.id}</span>
                      </div>
                      <p class="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">
                        {task.latest_summary || task.body || 'No description supplied.'}
                      </p>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        {#if task.assignee}
                          <span class="rounded-control border border-line bg-canvas px-1.5 py-0.5 text-[0.62rem] text-secondary">@{task.assignee}</span>
                        {/if}
                        {#if task.tenant}
                          <span class="rounded-control border border-line bg-canvas px-1.5 py-0.5 text-[0.62rem] text-ink-muted">{task.tenant}</span>
                        {/if}
                        {#if marker}
                          <span class={`rounded-control border px-1.5 py-0.5 text-[0.62rem] ${markerClass(task)}`}>{marker}</span>
                        {/if}
                      </div>
                      <div class="mt-2 flex items-center justify-between font-mono text-[0.62rem] text-ink-faint">
                        <span>priority {task.priority ?? 0}</span>
                        <span>age {formatAge(task.age?.created_age_seconds)}</span>
                      </div>
                    </button>
                  {/each}
                {/if}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    </Panel>

    <Panel title="Card detail" padded={false} contentClass="flex min-h-0 flex-col overflow-hidden p-3" actions={detailActions}>
      {#if loadingDetail}
        <div class="flex h-full items-center justify-center font-hud text-[0.72rem] uppercase tracking-[0.18em] text-primary">
          Loading card detail…
        </div>
      {:else if !selectedTaskDetail}
        <div class="flex h-full items-center justify-center rounded-panel border border-dashed border-line p-6 text-center text-sm leading-6 text-ink-muted">
          Select a card to inspect description, linked session, PR, issue, and activity.
        </div>
      {:else}
        {@const detail = selectedTaskDetail}
        <div class="min-h-0 flex-1 space-y-4 overflow-auto pr-1" data-selectable="true">
          <div>
            <div class="flex items-start justify-between gap-3">
              <h2 class="text-base font-semibold leading-6 text-ink-bright">{detail.task.title}</h2>
              <span class={`rounded-control border px-2 py-1 font-mono text-[0.68rem] ${statusTone(detail.task.status)}`}>{statusLabel(detail.task.status)}</span>
            </div>
            <p class="mt-1 font-mono text-[0.68rem] text-ink-faint">{detail.task.id}</p>
          </div>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">Description</h3>
            <pre class="max-h-56 overflow-auto rounded-panel border border-line bg-canvas/55 p-3 text-xs leading-5 whitespace-pre-wrap text-ink-muted">{detail.task.body || 'No description recorded.'}</pre>
          </section>

          <section class="grid grid-cols-2 gap-2 text-xs leading-5">
            <div class="rounded-panel border border-line bg-surface-raised/50 p-2">
              <h3 class="font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">Assignee</h3>
              <p class="mt-1 text-ink-bright">{detail.task.assignee || 'unassigned'}</p>
            </div>
            <div class="rounded-panel border border-line bg-surface-raised/50 p-2">
              <h3 class="font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">Workspace</h3>
              <p class="mt-1 break-all text-ink-bright">{detail.task.workspace_path || detail.task.workspace_kind || '—'}</p>
            </div>
            <div class="rounded-panel border border-line bg-surface-raised/50 p-2">
              <h3 class="font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">Created</h3>
              <p class="mt-1 text-ink-bright">{formatEpoch(detail.task.created_at)}</p>
            </div>
            <div class="rounded-panel border border-line bg-surface-raised/50 p-2">
              <h3 class="font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">Heartbeat</h3>
              <p class="mt-1 text-ink-bright">{formatEpoch(detail.task.last_heartbeat_at)}</p>
            </div>
          </section>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">Linked session</h3>
            {#if detail.task.session_id}
              <a class="break-all text-sm text-secondary hover:text-ink-bright" href={`#${agentRoute(detail.task.session_id)}`}>{detail.task.session_id}</a>
            {:else}
              <p class="text-sm text-ink-muted">No originating session recorded for this card.</p>
            {/if}
          </section>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">PR / issue</h3>
            {#if selectedReferences.length}
              <div class="space-y-1">
                {#each selectedReferences as ref}
                  <p class="break-all rounded-control border border-line bg-canvas/55 px-2 py-1 text-xs text-ink-muted">{ref}</p>
                {/each}
              </div>
            {:else}
              <p class="text-sm text-ink-muted">No PR or issue reference found in the card text or latest handoff.</p>
            {/if}
          </section>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">Links</h3>
            <p class="text-xs leading-5 text-ink-muted">Parents: {detail.links.parents.join(', ') || 'none'}</p>
            <p class="text-xs leading-5 text-ink-muted">Children: {detail.links.children.join(', ') || 'none'}</p>
          </section>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">Activity</h3>
            <div class="space-y-2">
              {#each detail.events.slice(-10).reverse() as event (`event-${event.id ?? event.kind}-${event.created_at}`)}
                <div class="rounded-panel border border-line bg-surface-raised/45 p-2 text-xs leading-5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold text-ink-bright">{event.kind}</span>
                    <span class="font-mono text-[0.62rem] text-ink-faint">{formatEpoch(event.created_at)}</span>
                  </div>
                  {#if eventPayload(event)}
                    <p class="mt-1 break-all text-ink-muted">{eventPayload(event)}</p>
                  {/if}
                </div>
              {/each}
            </div>
          </section>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">Run history</h3>
            <div class="space-y-2">
              {#each detail.runs.slice(-5).reverse() as run (`run-${run.id}`)}
                <div class="rounded-panel border border-line bg-surface-raised/45 p-2 text-xs leading-5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold text-ink-bright">{run.profile || 'profile'} · {run.status || run.outcome || 'run'}</span>
                    <span class="font-mono text-[0.62rem] text-ink-faint">{formatEpoch(run.started_at)}</span>
                  </div>
                  {#if run.summary || run.error}
                    <p class="mt-1 text-ink-muted">{run.summary || run.error}</p>
                  {/if}
                </div>
              {/each}
            </div>
          </section>

          <section>
            <h3 class="mb-2 font-hud text-[0.68rem] uppercase tracking-[0.16em] text-primary">Comments</h3>
            <div class="space-y-2">
              {#each detail.comments as comment (`comment-${comment.id ?? comment.created_at}`)}
                <div class="rounded-panel border border-line bg-canvas/55 p-2 text-xs leading-5">
                  <div class="mb-1 flex items-center justify-between gap-2 text-[0.62rem] uppercase tracking-[0.12em] text-ink-faint">
                    <span>{comment.author || 'dashboard'}</span>
                    <span>{formatEpoch(comment.created_at)}</span>
                  </div>
                  <p class="whitespace-pre-wrap text-ink-muted">{comment.body}</p>
                </div>
              {/each}
            </div>
            <form class="mt-3 flex gap-2" onsubmit={submitComment}>
              <input
                class="min-w-0 flex-1 rounded-control border border-line bg-canvas px-2 py-1 text-sm text-ink-bright placeholder:text-ink-faint"
                placeholder="Add operator note"
                bind:value={newComment}
              />
              <Button size="sm" variant="primary" disabled={commentSaving || !newComment.trim()}>Comment</Button>
            </form>
          </section>
        </div>
      {/if}
    </Panel>
  </div>
</section>

{#snippet boardActions()}
  <Button size="sm" chrome="ghost" variant="primary" onclick={() => loadKanbanBoards()} disabled={loadingBoards || loadingBoard}>Refresh</Button>
{/snippet}

{#snippet detailActions()}
  {#if selectedTaskId}
    <Button size="sm" chrome="ghost" variant="secondary" onclick={() => loadSelectedTaskDetail()} disabled={loadingDetail}>Reload</Button>
  {/if}
{/snippet}
