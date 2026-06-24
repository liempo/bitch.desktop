<script lang="ts">
  import { onMount } from 'svelte'
  import { Popover } from 'bits-ui'

  import Button from '@/app/components/ui/Button.svelte'
  import Icon from '@/app/components/ui/Icon.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { popoverClass } from '@/app/components/ui/styles'
  import { messageForError } from '$lib/errors'
  import { gatewayState } from '$lib/hermes/gateway'
  import {
    getKanbanBoard,
    kanbanDisplayStatus,
    listKanbanBoards,
    type KanbanBoardMeta,
    type KanbanColumn,
    type KanbanTask
  } from '$lib/hermes/kanban'
  import { kanbanRoute } from '../../router.svelte'

  interface Props {
    class?: string
    titleClass?: string
  }

  let { class: className = '', titleClass = '' }: Props = $props()

  const KANBAN_STATUS_LABELS: Record<string, string> = {
    archived: 'Archived',
    blocked: 'Blocked',
    done: 'Done',
    ready: 'Ready',
    running: 'Running',
    scheduled: 'Scheduled',
    todo: 'Todo',
    triage: 'Triage'
  }
  const KANBAN_FOCUS_STATUS_RANK: Record<string, number> = {
    blocked: 0,
    running: 1,
    ready: 2,
    scheduled: 3,
    todo: 4,
    triage: 5
  }
  const KANBAN_ACTIVE_STATUSES = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked']
  const kanbanBoardMenuContentClass = `${popoverClass} z-50 w-64 p-1.5 font-mono rounded-none!`
  const raisedPanelClass = 'min-h-0 rounded-none! !border-line !bg-surface-raised'

  let kanbanBoardMenuOpen = $state(false)
  let kanbanBoards = $state<KanbanBoardMeta[]>([])
  let kanbanBoardsCurrent = $state('')
  let kanbanBoardsError = $state('')
  let kanbanBoardsLoadedProfile = $state<null | string>(null)
  let kanbanBoardsLoading = $state(false)
  let kanbanBoardColumns = $state<KanbanColumn[]>([])
  let kanbanBoardNow = $state(0)
  let kanbanLatestEventId = $state(0)

  const kanbanHref = $derived(`#${kanbanRoute()}`)
  const kanbanBoardProfile = $derived(gatewayState.activeProfile || 'default')
  const kanbanCurrentBoardSlug = $derived(
    kanbanBoardsCurrent || kanbanBoards.find(board => board.is_current)?.slug || kanbanBoards[0]?.slug || ''
  )
  const kanbanCurrentBoard = $derived(kanbanBoards.find(board => board.slug === kanbanCurrentBoardSlug) ?? null)
  const kanbanCurrentBoardLabel = $derived(
    kanbanBoardsLoading && kanbanBoardsLoadedProfile !== kanbanBoardProfile
      ? 'sync'
      : kanbanCurrentBoard
        ? kanbanBoardLabel(kanbanCurrentBoard)
        : kanbanCurrentBoardSlug || '--'
  )
  const kanbanCountsByStatus = $derived.by((): Record<string, number> => {
    const counts: Record<string, number> = {}

    if (kanbanBoardColumns.length > 0) {
      for (const column of kanbanBoardColumns) {
        const status = String(kanbanDisplayStatus(column.name))
        counts[status] = (counts[status] ?? 0) + column.tasks.length
      }

      return counts
    }

    for (const [status, count] of Object.entries(kanbanCurrentBoard?.counts ?? {})) {
      const displayStatus = String(kanbanDisplayStatus(status))
      counts[displayStatus] = (counts[displayStatus] ?? 0) + (count ?? 0)
    }

    return counts
  })
  const kanbanTotalCards = $derived(
    kanbanBoardColumns.length > 0
      ? Object.values(kanbanCountsByStatus).reduce((total, count) => total + count, 0)
      : (kanbanCurrentBoard?.total ?? Object.values(kanbanCountsByStatus).reduce((total, count) => total + count, 0))
  )
  const kanbanActiveCards = $derived(countKanbanStatuses(KANBAN_ACTIVE_STATUSES))
  const kanbanBlockedCards = $derived(countKanbanStatuses(['blocked']))
  const kanbanReadyCards = $derived(countKanbanStatuses(['ready']))
  const kanbanRunningCards = $derived(countKanbanStatuses(['running']))
  const kanbanFocusTasks = $derived.by(() => collectKanbanFocusTasks())
  const kanbanStats = $derived([
    { label: 'Active', toneClass: 'text-primary', value: kanbanActiveCards },
    { label: 'Running', toneClass: 'text-primary', value: kanbanRunningCards },
    { label: 'Ready', toneClass: 'text-secondary', value: kanbanReadyCards },
    { label: 'Blocked', toneClass: 'text-warning', value: kanbanBlockedCards }
  ])
  const kanbanPanelMeta = $derived(
    kanbanBoardsLoading
      ? 'syncing'
      : kanbanLatestEventId
        ? `event ${kanbanLatestEventId}`
        : kanbanBoards.length
          ? `${kanbanBoards.length} boards`
          : 'no boards'
  )

  onMount(() => {
    void refreshKanbanBoards()
    const kanbanTimer = window.setInterval(() => void refreshKanbanBoards(), 15000)

    return () => window.clearInterval(kanbanTimer)
  })

  $effect(() => {
    if (kanbanBoardsLoadedProfile !== kanbanBoardProfile && !kanbanBoardsLoading) {
      void refreshKanbanBoards()
    }
  })

  async function refreshKanbanBoards(): Promise<void> {
    if (kanbanBoardsLoading) return

    const profile = kanbanBoardProfile
    kanbanBoardsLoading = true
    kanbanBoardsError = ''

    try {
      const response = await listKanbanBoards(profile)
      const selectedBoard = resolveKanbanBoardSlug(response.boards, response.current, profile)
      kanbanBoards = response.boards
      kanbanBoardsCurrent = selectedBoard

      await loadKanbanBoardSnapshot(selectedBoard, profile)
    } catch (error) {
      if (kanbanBoardsLoadedProfile !== profile) {
        kanbanBoards = []
        kanbanBoardsCurrent = ''
        kanbanBoardColumns = []
        kanbanBoardNow = 0
        kanbanLatestEventId = 0
      }
      kanbanBoardsError = messageForError(error)
    } finally {
      kanbanBoardsLoadedProfile = profile
      kanbanBoardsLoading = false
    }
  }

  async function selectKanbanBoard(board: KanbanBoardMeta): Promise<void> {
    const slug = board.slug.trim()
    if (!slug || kanbanBoardsLoading) return

    if (slug === kanbanCurrentBoardSlug) {
      kanbanBoardMenuOpen = false
      return
    }

    const profile = kanbanBoardProfile
    kanbanBoardsCurrent = slug
    kanbanBoardsLoading = true
    kanbanBoardsError = ''
    kanbanBoardColumns = []
    kanbanBoardNow = 0
    kanbanLatestEventId = 0

    try {
      await loadKanbanBoardSnapshot(slug, profile)
      kanbanBoardMenuOpen = false
    } catch (error) {
      kanbanBoardsError = messageForError(error)
    } finally {
      kanbanBoardsLoadedProfile = profile
      kanbanBoardsLoading = false
    }
  }

  async function loadKanbanBoardSnapshot(boardSlug: string, profile: string): Promise<void> {
    const board = await getKanbanBoard({ board: boardSlug || null, profile })
    kanbanBoardColumns = board.columns
    kanbanBoardNow = board.now
    kanbanLatestEventId = board.latest_event_id
  }

  function collectKanbanFocusTasks(): KanbanTask[] {
    return kanbanBoardColumns
      .flatMap(column => column.tasks)
      .filter(task => !['archived', 'done'].includes(String(kanbanDisplayStatus(task.status))))
      .sort((a, b) => {
        const statusDelta = kanbanTaskStatusRank(a) - kanbanTaskStatusRank(b)
        if (statusDelta !== 0) return statusDelta

        const warningDelta = Number(Boolean(b.warnings?.count)) - Number(Boolean(a.warnings?.count))
        if (warningDelta !== 0) return warningDelta

        return (b.priority ?? 0) - (a.priority ?? 0)
      })
  }

  function countKanbanStatuses(statuses: string[]): number {
    return statuses.reduce((total, status) => total + (kanbanCountsByStatus[status] ?? 0), 0)
  }

  function formatKanbanBoardCount(value: null | number | undefined): string {
    return typeof value === 'number' ? formatDashboardCount(value) : '--'
  }

  function formatDashboardCount(value: number): string {
    return value > 99 ? '99+' : String(value)
  }

  function kanbanBoardLabel(board: KanbanBoardMeta): string {
    return compactText(board.name) || board.slug
  }

  function kanbanBoardMetaLabel(board: KanbanBoardMeta): string {
    const parts = [board.slug, `${formatKanbanBoardCount(board.total)} cards`, board.archived ? 'archived' : ''].filter(Boolean)
    return parts.join(' · ')
  }

  function resolveKanbanBoardSlug(boards: KanbanBoardMeta[], currentBoard: string, profile: string): string {
    const keepSelectedBoard = kanbanBoardsLoadedProfile === profile && boards.some(board => board.slug === kanbanBoardsCurrent)
    if (keepSelectedBoard) return kanbanBoardsCurrent
    return currentBoard || boards.find(board => board.is_current)?.slug || boards[0]?.slug || ''
  }

  function kanbanStatusLabel(status: string): string {
    const displayStatus = String(kanbanDisplayStatus(status))
    return KANBAN_STATUS_LABELS[displayStatus] ?? displayStatus.replace(/[_-]/g, ' ')
  }

  function kanbanStatusPillClass(status: string): string {
    switch (kanbanDisplayStatus(status)) {
      case 'blocked':
        return 'border-danger/40 bg-danger/10 text-danger'
      case 'running':
        return 'border-primary/40 bg-primary/10 text-primary'
      case 'ready':
        return 'border-secondary/40 bg-secondary/10 text-secondary'
      case 'scheduled':
        return 'border-warning/40 bg-warning/10 text-warning'
      default:
        return 'border-line bg-canvas text-ink-muted'
    }
  }

  function kanbanTaskMarker(task: KanbanTask): string {
    const displayStatus = kanbanDisplayStatus(task.status)
    if (displayStatus === 'running') {
      const stale = typeof task.last_heartbeat_at === 'number' && kanbanBoardNow > 0 && kanbanBoardNow - task.last_heartbeat_at > 60 * 60
      return stale ? 'stale worker' : 'in progress'
    }
    if (displayStatus === 'blocked') return 'blocked'
    if (task.warnings?.count) return `${task.warnings.count} diagnostics`
    if (task.progress) return `${task.progress.done}/${task.progress.total} children`
    return ''
  }

  function kanbanTaskMarkerClass(task: KanbanTask): string {
    const marker = kanbanTaskMarker(task)
    if (marker.includes('stale') || marker === 'blocked') return 'border-danger/40 bg-danger/10 text-danger'
    if (marker.includes('diagnostics')) return 'border-warning/40 bg-warning/10 text-warning'
    if (marker === 'in progress') return 'border-primary/40 bg-primary/10 text-primary'
    return 'border-line bg-canvas text-ink-muted'
  }

  function kanbanTaskStatusRank(task: KanbanTask): number {
    return KANBAN_FOCUS_STATUS_RANK[String(kanbanDisplayStatus(task.status))] ?? 50
  }

  function compactText(value: null | string | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  }
</script>

<Panel
  fullHeight={false}
  title="KANBAN"
  padded={false}
  class={className}
  contentClass="flex h-full min-h-0 flex-col gap-3 p-3 pt-4"
  titleClass={titleClass}
>
  {#snippet actions()}
    <Popover.Root bind:open={kanbanBoardMenuOpen}>
      <Popover.Trigger title={`BOARD::${kanbanCurrentBoardLabel}`} aria-label={`View available Kanban boards. Current board: ${kanbanCurrentBoardLabel}`}>
        {#snippet child({ props })}
          <Button {...props} size="sm" chrome="ghost" variant="primary" class="rounded-none!"><Icon name="board" class="text-[0.85rem]" /><span>BOARD::{kanbanCurrentBoardLabel}</span></Button>
        {/snippet}
      </Popover.Trigger>

      <Popover.Content class={kanbanBoardMenuContentClass} sideOffset={4} align="end">
        <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          available boards
        </div>

        {#if kanbanBoardsLoading}
          <div class="px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-muted">syncing boards…</div>
        {:else if kanbanBoardsError}
          <div class="px-2 py-1.5 text-[11px] leading-4 text-danger">{kanbanBoardsError}</div>
        {:else if kanbanBoards.length === 0}
          <div class="px-2 py-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-muted">no boards reported</div>
        {:else}
          <div class="grid gap-1">
            {#each kanbanBoards as board (board.slug)}
              <Button
                size="sm"
                variant={board.slug === kanbanCurrentBoardSlug ? 'primary' : 'default'}
                class="w-full rounded-none!"
                onclick={() => void selectKanbanBoard(board)}
                aria-current={board.slug === kanbanCurrentBoardSlug ? 'true' : undefined}
                aria-label={`Switch Kanban board to ${kanbanBoardLabel(board)}`}
              >
                <span class="flex w-full items-start justify-between gap-2 text-left">
                  <span class="min-w-0">
                    <span class="block truncate">board:{kanbanBoardLabel(board)}</span>
                    <span class="mt-0.5 block truncate text-[10px] text-ink-muted/80">{kanbanBoardMetaLabel(board)}</span>
                  </span>
                  {#if board.slug === kanbanCurrentBoardSlug}
                    <Icon name="check" label="Current board" decorative={false} class="text-primary" />
                  {/if}
                </span>
              </Button>
            {/each}
          </div>
        {/if}
      </Popover.Content>
    </Popover.Root>
  {/snippet}

  <div class="grid grid-cols-2 gap-2 text-center uppercase tracking-[0.12em] md:grid-cols-4">
    {#each kanbanStats as stat (stat.label)}
      <Panel flat fullHeight={false} padded={false} class={raisedPanelClass} contentClass="p-2">
        <div class="text-[0.58rem] text-ink-muted">{stat.label}</div>
        <div class={`mt-1 text-[0.78rem] font-bold ${stat.toneClass}`}>{formatDashboardCount(stat.value)}</div>
      </Panel>
    {/each}
  </div>

  <section class="flex min-h-0 flex-1 flex-col gap-2" aria-label="Kanban focus queue">
    <div class="flex shrink-0 items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.14em]">
      <span class="text-ink-muted">Focus queue</span>
      <span class={kanbanBoardsError ? 'text-warning' : 'text-ink-faint'}>{kanbanPanelMeta}</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
      {#if kanbanBoardsError && kanbanFocusTasks.length === 0}
        <div class="flex items-center gap-2 rounded-none border border-danger/40 bg-danger/10 p-3 text-[0.68rem] leading-4 text-danger">
          <Icon name="error" label="Kanban error" decorative={false} />
          <span>Kanban unavailable: {kanbanBoardsError}</span>
        </div>
      {:else if kanbanBoardsLoading && kanbanFocusTasks.length === 0}
        <div class="flex items-center gap-2 rounded-none border border-line bg-surface-raised/60 p-3 text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">
          <Icon name="sync" class="text-primary" />
          <span>Syncing current board…</span>
        </div>
      {:else if kanbanFocusTasks.length === 0}
        <div class="flex items-center gap-2 rounded-none border border-dashed border-line p-3 text-[0.68rem] leading-4 text-ink-muted">
          <Icon name="kanban" class="text-ink-muted" />
          <span>{kanbanTotalCards ? 'No active focus cards on this board.' : 'No cards reported on this board.'}</span>
        </div>
      {:else}
        <div class="grid content-start gap-1.5">
          {#each kanbanFocusTasks as task (task.id)}
            {@const marker = kanbanTaskMarker(task)}
            <a
              class="min-w-0 rounded-none border border-line bg-surface-raised/70 p-2 text-inherit transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
              href={kanbanHref}
              aria-label={`Open Kanban card ${task.title}`}
            >
              <div class="flex items-start justify-between gap-2">
                <span class="min-w-0 truncate text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-bright" title={task.title}>{task.title}</span>
                <span class="shrink-0 text-[0.58rem] text-ink-faint">{task.id}</span>
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span class={`rounded-none border px-1.5 py-0.5 text-[0.58rem] uppercase ${kanbanStatusPillClass(task.status)}`}>
                  {kanbanStatusLabel(task.status)}
                </span>
                {#if marker}
                  <span class={`rounded-none border px-1.5 py-0.5 text-[0.58rem] uppercase ${kanbanTaskMarkerClass(task)}`}>{marker}</span>
                {/if}
                {#if task.assignee}
                  <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-secondary">@{task.assignee}</span>
                {/if}
                <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-ink-muted">p{task.priority ?? 0}</span>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  {#if kanbanBoardsError && kanbanFocusTasks.length > 0}
    <div class="rounded-none border border-warning/40 bg-warning/10 p-2 text-[0.62rem] leading-4 text-warning">
      Last sync failed: {kanbanBoardsError}
    </div>
  {/if}

  <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[0.62rem] uppercase tracking-[0.12em]">
    <span class="min-w-0 truncate text-ink-faint" title={`profile=${kanbanBoardProfile} · board=${kanbanCurrentBoardSlug || '—'} · cards=${kanbanTotalCards}`}>
      profile={kanbanBoardProfile} · cards={formatDashboardCount(kanbanTotalCards)}
    </span>
    <Button size="sm" chrome="ghost" variant="primary" class="rounded-none!" href={kanbanHref} aria-label="Open Kanban board">
      <Icon name="external" class="text-[0.85rem]" />
      <span>Open Kanban</span>
    </Button>
  </div>
</Panel>
