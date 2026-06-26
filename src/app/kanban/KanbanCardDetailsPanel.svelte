<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { kanbanDisplayStatus, type KanbanEvent, type KanbanTask, type KanbanTaskDetailResponse } from '$lib/hermes/kanban'
  import { agentRoute } from '../router.svelte'

  interface DetailRow {
    label: string
    value: string
  }

  interface Props {
    class?: string
    comment?: string
    commentSaving?: boolean
    contentClass?: string
    detail?: KanbanTaskDetailResponse | null
    loading?: boolean
    onClose?: () => void
    onSubmitComment?: (event: SubmitEvent) => void | Promise<void>
    showIdentity?: boolean
    title?: string
  }

  const COLUMN_LABELS: Record<string, string> = {
    archived: 'Archived',
    blocked: 'Blocked',
    done: 'Done',
    ready: 'Ready',
    review: 'Review',
    running: 'Running',
    scheduled: 'Scheduled',
    todo: 'Todo',
    triage: 'Triage'
  }

  let {
    class: className = '',
    comment = $bindable(''),
    commentSaving = false,
    contentClass = 'min-h-0 overflow-hidden p-3',
    detail = null,
    loading = false,
    onClose,
    onSubmitComment,
    showIdentity = true,
    title = 'DETAIL'
  }: Props = $props()

  const fieldLabelClass = 'font-hud text-[0.58rem] font-bold uppercase tracking-[0.14em] text-ink-dim'
  const valueClass = 'mt-1 min-w-0 wrap-anywhere text-[0.68rem] leading-5 text-ink-muted'
  const monoValueClass = `${valueClass} font-mono text-ink-bright`
  const detailRows = $derived.by(() => (detail ? taskDetailRows(detail.task) : []))
  const references = $derived.by(() => referenceMatches(detail))
  const bodyText = $derived(clean(detail?.task.body))
  const summaryText = $derived(clean(detail?.task.latest_summary))
  const resultText = $derived(clean(detail?.task.result))
  function clean(value: null | string | undefined): string {
    return value?.trim() ?? ''
  }

  function display(value: null | number | string | undefined, fallback = '—'): string {
    if (value === null || value === undefined || value === '') return fallback
    const text = String(value).trim()
    return text || fallback
  }

  function listLabel(values?: null | string[]): string {
    return values?.map(value => value.trim()).filter(Boolean).join(', ') ?? ''
  }

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

  function formatEpoch(value: null | number | undefined): string {
    if (typeof value !== 'number' || value <= 0) return '—'
    return new Date(value * 1000).toLocaleString()
  }

  function formatDuration(seconds: null | number | undefined): string {
    if (typeof seconds !== 'number' || seconds < 0) return ''
    if (seconds < 60) return `${Math.floor(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  function taskDetailRows(task: KanbanTask): DetailRow[] {
    const progress = task.progress ? `${task.progress.done}/${task.progress.total}` : ''
    const linkCounts = task.link_counts ? `${task.link_counts.parents} parents · ${task.link_counts.children} children` : ''
    const age = formatDuration(task.age?.created_age_seconds)

    return [
      { label: 'Card ID', value: task.id },
      { label: 'Status', value: statusLabel(task.status) },
      { label: 'Assignee', value: display(task.assignee, 'unassigned') },
      { label: 'Tenant', value: display(task.tenant) },
      { label: 'Priority', value: display(task.priority ?? 0) },
      { label: 'Age', value: age },
      { label: 'Created', value: formatEpoch(task.created_at) },
      { label: 'Started', value: formatEpoch(task.started_at) },
      { label: 'Completed', value: formatEpoch(task.completed_at) },
      { label: 'Heartbeat', value: formatEpoch(task.last_heartbeat_at) },
      { label: 'Created by', value: display(task.created_by) },
      { label: 'Workspace kind', value: display(task.workspace_kind) },
      { label: 'Workspace path', value: display(task.workspace_path) },
      { label: 'Branch', value: display(task.branch_name) },
      { label: 'Current run', value: display(task.current_run_id) },
      { label: 'Current step', value: display(task.current_step_key) },
      { label: 'Worker PID', value: display(task.worker_pid) },
      { label: 'Goal mode', value: task.goal_mode ? 'yes' : '' },
      { label: 'Goal turns', value: display(task.goal_max_turns) },
      { label: 'Max runtime', value: task.max_runtime_seconds ? `${task.max_runtime_seconds}s` : '' },
      { label: 'Failures', value: task.consecutive_failures ? String(task.consecutive_failures) : '' },
      { label: 'Warnings', value: task.warnings?.count ? `${task.warnings.count} ${task.warnings.highest_severity || 'warnings'}` : '' },
      { label: 'Progress', value: progress },
      { label: 'Links', value: linkCounts },
      { label: 'Skills', value: listLabel(task.skills) },
      { label: 'Comments', value: task.comment_count ? String(task.comment_count) : '' }
    ].filter(row => row.value && row.value !== '—')
  }

  function referenceMatches(taskDetail: KanbanTaskDetailResponse | null): string[] {
    if (!taskDetail) return []
    const text = [taskDetail.task.body, taskDetail.task.result, taskDetail.task.latest_summary].filter(Boolean).join('\n')
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

<Panel title={title} padded={false} contentClass={contentClass} class={className} leading={onClose ? closeAction : undefined}>
  <div
    class="flex h-[calc(100%+1px)] min-h-0 w-[calc(100%+1px)] flex-col gap-3 overflow-y-auto pb-px pr-px"
    style="--custom-scrollbar-offset-x: 4px"
    data-selectable="true"
  >
    {#if loading}
      <div class="flex h-full min-h-40 items-center justify-center text-primary">
        <Loader size="lg" label="Loading card detail" />
      </div>
    {:else if !detail}
      <div class="flex h-full min-h-40 items-center justify-center border border-dashed border-line p-6 text-center text-sm leading-6 text-ink-muted">
        Select a card to inspect description, linked session, PR, issue, and activity.
      </div>
    {:else}
      {@const task = detail.task}
      {#if showIdentity}
        <header class="min-w-0 border-b border-line/60 pb-3">
          <div class="min-w-0">
            <div class="flex items-start justify-between gap-3">
              <h2 class="min-w-0 flex-1 text-sm font-semibold leading-5 text-ink-bright" title={task.title}>{task.title}</h2>
              <span class={`shrink-0 border px-2 py-1 font-mono text-[0.68rem] ${statusTone(task.status)}`}>{statusLabel(task.status)}</span>
            </div>
            <p class="mt-1 truncate font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-muted" title={task.id}>{task.id}</p>
          </div>
        </header>
      {/if}

      <section class="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Kanban card metadata">
        {#each detailRows as row (row.label)}
          <div class="min-w-0 border border-line bg-canvas px-2 py-1.5">
            <div class={fieldLabelClass}>{row.label}</div>
            <div class={monoValueClass} title={row.value}>{row.value}</div>
          </div>
        {/each}
      </section>

      <section class="min-w-0 border border-line bg-canvas p-2" aria-label="Kanban card description">
        <div class={fieldLabelClass}>Description</div>
        <pre class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap wrap-anywhere text-xs leading-5 text-ink-muted">{bodyText || 'No description recorded.'}</pre>
      </section>

      {#if summaryText}
        <section class="min-w-0 border border-line bg-canvas p-2" aria-label="Kanban card latest summary">
          <div class={fieldLabelClass}>Latest summary</div>
          <pre class="mt-2 whitespace-pre-wrap wrap-anywhere text-xs leading-5 text-ink-muted">{summaryText}</pre>
        </section>
      {/if}

      {#if resultText}
        <section class="min-w-0 border border-line bg-canvas p-2" aria-label="Kanban card result">
          <div class={fieldLabelClass}>Result</div>
          <pre class="mt-2 whitespace-pre-wrap wrap-anywhere text-xs leading-5 text-ink-muted">{resultText}</pre>
        </section>
      {/if}

      <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="Linked session">
        <div class={fieldLabelClass}>Linked session</div>
        {#if task.session_id}
          <a class={`${valueClass} block break-all font-semibold text-secondary hover:text-ink-bright`} href={`#${agentRoute(task.session_id)}`}>{task.session_id}</a>
        {:else}
          <p class={valueClass}>No originating session recorded for this card.</p>
        {/if}
      </section>

      <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="PR or issue references">
        <div class={fieldLabelClass}>PR / issue</div>
        {#if references.length}
          <div class="mt-2 grid gap-1">
            {#each references as ref}
              <p class="border border-line bg-canvas px-2 py-1 text-xs text-ink-muted wrap-anywhere">{ref}</p>
            {/each}
          </div>
        {:else}
          <p class={valueClass}>No PR or issue reference found in the card text or latest handoff.</p>
        {/if}
      </section>

      <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="Kanban card links">
        <div class={fieldLabelClass}>Links</div>
        <p class={valueClass}>Parents: {detail.links.parents.join(', ') || 'none'}</p>
        <p class={valueClass}>Children: {detail.links.children.join(', ') || 'none'}</p>
      </section>

      <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="Kanban card activity">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted">Activity</h3>
          <span class="font-mono text-[0.62rem] text-ink-faint">{detail.events.length}/10</span>
        </div>
        {#if detail.events.length === 0}
          <div class="border border-dashed border-line p-2 text-xs text-ink-muted">No activity recorded for this card.</div>
        {:else}
          <div class="grid gap-1">
            {#each detail.events.slice(-10).reverse() as event (`event-${event.id ?? event.kind}-${event.created_at}`)}
              <article class="border border-line bg-canvas px-2 py-1.5 text-xs leading-5">
                <div class="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                  <span class="font-semibold text-ink-bright">{event.kind}</span>
                  <span class="font-mono text-[0.62rem] text-ink-faint">{formatEpoch(event.created_at)}</span>
                </div>
                {#if eventPayload(event)}
                  <p class="wrap-break-word text-ink-muted">{eventPayload(event)}</p>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="Kanban card run history">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted">Run history</h3>
          <span class="font-mono text-[0.62rem] text-ink-faint">{detail.runs.length}/5</span>
        </div>
        {#if detail.runs.length === 0}
          <div class="border border-dashed border-line p-2 text-xs text-ink-muted">No recorded run history for this card.</div>
        {:else}
          <div class="grid gap-1">
            {#each detail.runs.slice(-5).reverse() as run (`run-${run.id}`)}
              <article class="border border-line bg-canvas px-2 py-1.5 text-xs leading-5">
                <div class="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                  <span class="font-semibold text-ink-bright">{run.profile || 'profile'} · {run.status || run.outcome || 'run'}</span>
                  <span class="font-mono text-[0.62rem] text-ink-faint">{formatEpoch(run.started_at)}</span>
                </div>
                {#if run.summary || run.error}
                  <p class="wrap-break-word text-ink-muted">{run.summary || run.error}</p>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="Kanban card comments">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted">Comments</h3>
          <span class="font-mono text-[0.62rem] text-ink-faint">{detail.comments.length}</span>
        </div>
        {#if detail.comments.length === 0}
          <div class="border border-dashed border-line p-2 text-xs text-ink-muted">No comments recorded for this card.</div>
        {:else}
          <div class="grid gap-1">
            {#each detail.comments as item (`comment-${item.id ?? item.created_at}`)}
              <article class="border border-line bg-canvas px-2 py-1.5 text-xs leading-5">
                <div class="mb-1 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[0.62rem] uppercase tracking-[0.12em] text-ink-faint">
                  <span>{item.author || 'dashboard'}</span>
                  <span>{formatEpoch(item.created_at)}</span>
                </div>
                <p class="whitespace-pre-wrap wrap-anywhere text-ink-muted">{item.body}</p>
              </article>
            {/each}
          </div>
        {/if}

        {#if onSubmitComment}
          <form class="mt-3 flex gap-2" onsubmit={onSubmitComment}>
            <input
              class="min-w-0 flex-1 rounded-control border border-line bg-canvas px-2 py-1 text-sm text-ink-bright placeholder:text-ink-faint"
              placeholder="Add operator note"
              bind:value={comment}
            />
            <Button type="submit" size="sm" variant="primary" disabled={commentSaving || !comment.trim()} aria-label={commentSaving ? 'Saving comment' : 'Add comment'}>
              {#if commentSaving}
                <Loader size="sm" label="Saving comment" />
              {:else}
                Comment
              {/if}
            </Button>
          </form>
        {/if}
      </section>
    {/if}
  </div>
</Panel>

{#snippet closeAction()}
  <Button
    variant="unstyled"
    class="flex h-5 w-6 items-center justify-center p-0 text-xs text-ink-muted hover:text-ink-bright"
    onclick={() => onClose?.()}
    aria-label="Close card detail"
    title="Close card detail"
  >
    x
  </Button>
{/snippet}
