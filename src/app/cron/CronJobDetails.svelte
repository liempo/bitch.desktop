<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import {
    cronJobProfile,
    cronJobScheduleLabel,
    cronJobState,
    cronJobTitle,
    type CronJob
  } from '$lib/hermes/cron'
  import type { SessionInfo } from '$lib/types/hermes'
  import { agentRoute } from '../router.svelte'

  interface DetailRow {
    label: string
    value: string
  }

  interface Props {
    actionBusy?: boolean
    job: CronJob
    onEdit?: () => void
    onLoadRuns?: () => void | Promise<void>
    onPauseOrResume?: () => void | Promise<void>
    onRemove?: () => void | Promise<void>
    onRun?: () => void | Promise<void>
    runs?: SessionInfo[]
    runsLoading?: boolean
    showActions?: boolean
    showIdentity?: boolean
  }

  let {
    actionBusy = false,
    job,
    onEdit,
    onLoadRuns,
    onPauseOrResume,
    onRemove,
    onRun,
    runs = [],
    runsLoading = false,
    showActions = true,
    showIdentity = true
  }: Props = $props()

  const fieldLabelClass = 'font-hud text-[0.58rem] font-bold uppercase tracking-[0.14em] text-ink-dim'
  const valueClass = 'mt-1 min-w-0 wrap-anywhere text-[0.68rem] leading-5 text-ink-muted'
  const monoValueClass = `${valueClass} font-mono text-ink-bright`
  const state = $derived(cronJobState(job))
  const paused = $derived(state === 'paused')
  const detailRows = $derived.by(() => jobDetailRows(job))
  const promptText = $derived(clean(job.prompt))
  const scriptText = $derived(clean(job.script))
  const hasFailure = $derived(Boolean(job.last_error || job.last_delivery_error))
  const actionRowClass = $derived(showIdentity ? 'mt-3 flex flex-wrap gap-1.5' : 'flex flex-wrap gap-1.5')
  const showHeader = $derived(showIdentity || showActions)

  function clean(value: null | string | undefined): string {
    return value?.trim() ?? ''
  }

  function formatTime(value?: null | number | string): string {
    if (value === null || value === undefined || value === '') return '—'
    const date = typeof value === 'number' ? new Date(value < 10_000_000_000 ? value * 1000 : value) : new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }

  function listLabel(values?: null | string[]): string {
    return values?.map(value => value.trim()).filter(Boolean).join(', ') ?? ''
  }

  function skillLabel(job: CronJob): string {
    const values = [...(job.skills ?? [])]
    const legacySkill = clean(job.skill)
    if (legacySkill) values.push(legacySkill)
    return listLabel(values)
  }

  function repeatLabel(repeat: CronJob['repeat']): string {
    if (!repeat) return ''
    const completed = repeat.completed ?? 0
    return repeat.times == null ? `${completed} completed` : `${completed}/${repeat.times} completed`
  }

  function display(value: null | string | undefined, fallback = '—'): string {
    const text = clean(value)
    return text || fallback
  }

  function jobDetailRows(job: CronJob): DetailRow[] {
    return [
      { label: 'Job ID', value: job.id },
      { label: 'Profile', value: cronJobProfile(job) },
      { label: 'State', value: cronJobState(job) },
      { label: 'Schedule', value: cronJobScheduleLabel(job) },
      { label: 'Delivery', value: display(job.deliver, 'local') },
      { label: 'Provider', value: display(job.provider) },
      { label: 'Model', value: display(job.model) },
      { label: 'Workdir', value: display(job.workdir) },
      { label: 'No-agent mode', value: job.no_agent ? 'yes' : 'no' },
      { label: 'Enabled', value: job.enabled === false ? 'no' : 'yes' },
      { label: 'Last status', value: display(job.last_status) },
      { label: 'Last run', value: formatTime(job.last_run_at) },
      { label: 'Next run', value: formatTime(job.next_run_at) },
      { label: 'Created', value: formatTime(job.created_at) },
      { label: 'Skills', value: skillLabel(job) },
      { label: 'Toolsets', value: listLabel(job.enabled_toolsets) },
      { label: 'Context jobs', value: listLabel(job.context_from) },
      { label: 'Repeat', value: repeatLabel(job.repeat) },
      { label: 'Hermes home', value: display(job.hermes_home) },
      { label: 'Dashboard', value: display(job.base_url) }
    ].filter(row => row.value && row.value !== '—')
  }

  function runStatus(run: SessionInfo): string {
    if (run.is_active) return 'active'
    return run.ended_at == null ? 'pending' : 'ended'
  }

  function runTitle(run: SessionInfo): string {
    return run.title?.trim() || run.preview?.trim()?.slice(0, 80) || run.id
  }

  function runPreview(run: SessionInfo): string {
    const text = run.preview?.trim() ?? ''
    if (!text) return '—'
    return text.length > 260 ? `${text.slice(0, 260)}…` : text
  }
</script>

<div class="flex min-h-0 flex-col gap-3">
  {#if showHeader}
    <header class="min-w-0 border-b border-line/60 pb-3">
      {#if showIdentity}
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold text-ink-bright" title={cronJobTitle(job)}>{cronJobTitle(job)}</h2>
          <p class="mt-1 truncate font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-muted" title={job.id}>{job.id}</p>
        </div>
      {/if}

      {#if showActions}
        <div class={actionRowClass}>
          {#if onEdit}
            <Button size="sm" chrome="ghost" onclick={onEdit}>Edit</Button>
          {/if}
          {#if onRun}
            <Button size="sm" chrome="ghost" variant="primary" onclick={onRun} disabled={actionBusy}>Run</Button>
          {/if}
          {#if onPauseOrResume}
            <Button size="sm" chrome="ghost" variant={paused ? 'success' : 'warning'} onclick={onPauseOrResume} disabled={actionBusy}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          {/if}
          {#if onRemove}
            <Button size="sm" chrome="ghost" variant="danger" onclick={onRemove} disabled={actionBusy}>Remove</Button>
          {/if}
        </div>
      {/if}
    </header>
  {/if}

  {#if hasFailure}
    <section class="border border-danger/40 bg-danger/10 p-2 text-xs leading-5 text-danger" aria-label="Cron job failures">
      {#if job.last_error}<div>Run failure: {job.last_error}</div>{/if}
      {#if job.last_delivery_error}<div>Delivery failure: {job.last_delivery_error}</div>{/if}
    </section>
  {/if}

  <section class="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Cron job metadata">
    {#each detailRows as row (row.label)}
      <div class="min-w-0 border border-line bg-canvas px-2 py-1.5">
        <div class={fieldLabelClass}>{row.label}</div>
        <div class={monoValueClass} title={row.value}>{row.value}</div>
      </div>
    {/each}
  </section>

  {#if promptText}
    <section class="min-w-0 border border-line bg-canvas p-2" aria-label="Cron job prompt">
      <div class={fieldLabelClass}>Prompt</div>
      <pre class="mt-2 whitespace-pre-wrap wrap-anywhere text-xs leading-5 text-ink-muted">{promptText}</pre>
    </section>
  {/if}

  {#if scriptText}
    <section class="min-w-0 border border-line bg-canvas p-2" aria-label="Cron job script">
      <div class={fieldLabelClass}>Script</div>
      <pre class="mt-2 whitespace-pre-wrap wrap-anywhere font-mono text-xs leading-5 text-ink-muted">{scriptText}</pre>
    </section>
  {/if}

  <section class="min-w-0 border border-line bg-surface-raised/35 p-2" aria-label="Recent run output">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted">Recent run output</h3>
      {#if onLoadRuns}
        <Button size="sm" chrome="ghost" variant="secondary" onclick={onLoadRuns} disabled={runsLoading}>
          {runsLoading ? 'Loading…' : runs.length ? 'Refresh' : 'Load'}
        </Button>
      {/if}
    </div>

    {#if runsLoading}
      <div class="py-2 text-xs text-primary">Loading recent run output…</div>
    {:else if runs.length === 0}
      <div class="border border-dashed border-line p-2 text-xs text-ink-muted">No recorded run sessions loaded for this job.</div>
    {:else}
      <div class="grid gap-1">
        {#each runs as run (run.id)}
          <article class="border border-line bg-canvas px-2 py-1.5 text-xs leading-5">
            <div class="mb-1 flex min-w-0 flex-wrap items-center gap-2">
              <a class="min-w-0 break-all font-semibold text-primary hover:text-ink-bright" href={`#${agentRoute(run.id)}`}>{runTitle(run)}</a>
              <span class="inline-block border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[0.58rem] text-ink-muted">{runStatus(run)}</span>
              <span class="font-mono text-[0.62rem] text-ink-faint">{formatTime(run.started_at)}</span>
            </div>
            <p class="wrap-break-word text-ink-muted">{runPreview(run)}</p>
            {#if run.model || run.profile}
              <div class="mt-1 font-mono text-[0.62rem] text-ink-faint">{run.profile || cronJobProfile(job)} · {run.model || 'default model'}</div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>
