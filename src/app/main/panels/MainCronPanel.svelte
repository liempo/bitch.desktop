<script lang="ts">
  import { onMount } from 'svelte'

  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import MainDashboardStatGrid from '../components/MainDashboardStatGrid.svelte'
  import { messageForError } from '$lib/errors'
  import {
    cronJobProfile,
    cronJobScheduleLabel,
    cronJobState,
    cronJobTitle,
    getCronJobs,
    type CronJob
  } from '$lib/hermes/cron'
  import { cronRoute } from '../../router.svelte'

  interface Props {
    class?: string
    titleClass?: string
  }

  let { class: className = '', titleClass = '' }: Props = $props()

  let cronJobs = $state<CronJob[]>([])
  let cronError = $state('')
  let cronLoaded = $state(false)
  let cronLoading = $state(false)

  const cronHref = $derived(`#${cronRoute()}`)
  const cronProblemJobs = $derived.by(() => cronJobs.filter(isCronJobProblem).sort(compareCronJobsByNextRun))
  const cronUpcomingJobs = $derived.by(() =>
    cronJobs
      .filter(job => cronJobState(job) !== 'paused' && !isCronJobProblem(job))
      .sort(compareCronJobsByNextRun)
  )
  const cronFocusJobs = $derived.by(() => collectCronFocusJobs())
  const cronActiveJobs = $derived(countCronJobs(job => cronJobState(job) !== 'paused'))
  const cronPausedJobs = $derived(countCronJobs(job => cronJobState(job) === 'paused'))
  const cronAlertJobs = $derived(cronProblemJobs.length)
  const cronStats = $derived([
    { label: 'Jobs', toneClass: 'text-primary', value: cronJobs.length },
    { label: 'Active', toneClass: 'text-secondary', value: cronActiveJobs },
    { label: 'Paused', toneClass: 'text-warning', value: cronPausedJobs },
    { label: 'Alerts', toneClass: 'text-danger', value: cronAlertJobs }
  ])
  const cronPanelMeta = $derived(
    cronLoading
      ? 'syncing'
      : cronError
        ? 'degraded'
        : cronUpcomingJobs[0]?.next_run_at
          ? `next ${formatCronRelativeTime(cronUpcomingJobs[0].next_run_at)}`
          : cronLoaded
            ? 'no upcoming runs'
            : 'not synced'
  )

  onMount(() => {
    void refreshCronJobs()
    const cronTimer = window.setInterval(() => void refreshCronJobs(), 30000)

    return () => window.clearInterval(cronTimer)
  })

  async function refreshCronJobs(): Promise<void> {
    if (cronLoading) return

    cronLoading = true
    cronError = ''

    try {
      cronJobs = await getCronJobs('all')
      cronLoaded = true
    } catch (error) {
      if (!cronLoaded) cronJobs = []
      cronError = messageForError(error)
    } finally {
      cronLoading = false
    }
  }

  function collectCronFocusJobs(): CronJob[] {
    const seen = new Set<string>()
    const jobs: CronJob[] = []

    for (const job of [...cronProblemJobs, ...cronUpcomingJobs]) {
      const key = cronJobDashboardKey(job)
      if (seen.has(key)) continue
      seen.add(key)
      jobs.push(job)
    }

    return jobs
  }

  function compareCronJobsByNextRun(a: CronJob, b: CronJob): number {
    const aTime = cronTimestamp(a.next_run_at)
    const bTime = cronTimestamp(b.next_run_at)
    if (aTime !== bTime) return aTime - bTime
    return cronJobTitle(a).localeCompare(cronJobTitle(b))
  }

  function countCronJobs(predicate: (job: CronJob) => boolean): number {
    return cronJobs.reduce((total, job) => total + (predicate(job) ? 1 : 0), 0)
  }

  function cronErrorText(job: CronJob): string {
    return compactText(job.last_error) || compactText(job.last_delivery_error) || compactText(job.last_status) || 'Attention needed'
  }

  function cronJobDashboardKey(job: CronJob): string {
    return `${cronJobProfile(job)}:${job.id}`
  }

  function cronJobModeLabel(job: CronJob): string {
    if (job.no_agent) return 'no-agent'
    if (job.script) return 'script'
    return job.deliver || 'local'
  }

  function cronJobPreview(job: CronJob): string {
    return truncateCompact(job.prompt || job.script || cronJobScheduleLabel(job), 96)
  }

  function cronStateClass(job: CronJob): string {
    const state = cronJobState(job)
    const base = 'rounded-none border px-1.5 py-0.5 text-[0.58rem] uppercase'
    if (isCronJobProblem(job)) return `${base} border-danger/40 bg-danger/10 text-danger`
    if (state === 'paused') return `${base} border-warning/40 bg-warning/10 text-warning`
    return `${base} border-success/40 bg-success/10 text-success`
  }

  function cronTimestamp(value?: null | number | string): number {
    if (value === null || value === undefined || value === '') return Number.POSITIVE_INFINITY
    const timestamp = typeof value === 'number' ? (value < 10_000_000_000 ? value * 1000 : value) : new Date(value).getTime()
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
  }

  function formatCronRelativeTime(value?: null | number | string): string {
    const timestamp = cronTimestamp(value)
    if (!Number.isFinite(timestamp)) return '—'

    const deltaSeconds = Math.round((timestamp - Date.now()) / 1000)
    const absSeconds = Math.abs(deltaSeconds)
    const suffix = deltaSeconds < 0 ? 'ago' : ''
    const prefix = deltaSeconds < 0 ? '' : 'in '

    if (absSeconds < 60) return deltaSeconds < 0 ? 'now' : 'in <1m'
    if (absSeconds < 3600) return `${prefix}${Math.round(absSeconds / 60)}m${suffix ? ` ${suffix}` : ''}`
    if (absSeconds < 86400) return `${prefix}${Math.round(absSeconds / 3600)}h${suffix ? ` ${suffix}` : ''}`
    return `${prefix}${Math.round(absSeconds / 86400)}d${suffix ? ` ${suffix}` : ''}`
  }

  function formatDashboardCount(value: number): string {
    return value > 99 ? '99+' : String(value)
  }

  function isCronJobProblem(job: CronJob): boolean {
    const state = cronJobState(job).toLowerCase()
    const lastStatus = compactText(job.last_status).toLowerCase()
    return Boolean(job.last_error || job.last_delivery_error || ['error', 'failed'].includes(state) || ['error', 'failed'].includes(lastStatus))
  }

  function compactText(value: null | string | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function truncateCompact(value: null | string | undefined, maxLength: number): string {
    const text = compactText(value)
    if (!text) return '—'
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
  }
</script>

<Panel
  fullHeight={false}
  title="CRON"
  padded={false}
  class={className}
  contentClass="flex h-full min-h-0 flex-col gap-3 p-3 pt-4"
  titleClass={titleClass}
>
  {#snippet actions()}
    <Button
      size="sm"
      chrome="ghost"
      variant="secondary"
      class="rounded-none!"
      onclick={() => void refreshCronJobs()}
      disabled={cronLoading}
      title="Refresh cron jobs"
      aria-label="Refresh cron jobs"
    >
      Sync
    </Button>
  {/snippet}

  <MainDashboardStatGrid stats={cronStats} formatValue={formatDashboardCount} />

  <section class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2" aria-label="Cron run queue">
    <div class="flex items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.14em]">
      <span class="text-ink-muted">Run queue</span>
      <span class={cronError ? 'text-warning' : 'text-ink-faint'}>{cronPanelMeta}</span>
    </div>

    {#if cronError && cronFocusJobs.length === 0}
      <div class="rounded-none border border-danger/40 bg-danger/10 p-3 text-[0.68rem] leading-4 text-danger">
        Cron unavailable: {cronError}
      </div>
    {:else if cronLoading && cronFocusJobs.length === 0}
      <div class="rounded-none border border-line bg-surface-raised/60 p-3 text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">
        Syncing scheduler jobs…
      </div>
    {:else if cronFocusJobs.length === 0}
      <div class="rounded-none border border-dashed border-line p-3 text-[0.68rem] leading-4 text-ink-muted">
        {cronJobs.length ? 'No upcoming scheduler runs.' : 'No cron jobs visible across profiles.'}
      </div>
    {:else}
      <div class="grid min-h-0 gap-1.5 overflow-y-auto overscroll-contain pr-1">
        {#each cronFocusJobs as job (cronJobDashboardKey(job))}
          {@const problem = isCronJobProblem(job)}
          <a
            class="min-w-0 rounded-none border border-line bg-surface-raised/70 p-2 text-inherit transition-colors hover:border-secondary/50 hover:bg-secondary/10 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            href={cronHref}
            aria-label={`Open cron job ${cronJobTitle(job)}`}
          >
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 truncate text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-bright" title={cronJobTitle(job)}>{cronJobTitle(job)}</span>
              <span class={cronStateClass(job)}>{problem ? 'alert' : cronJobState(job)}</span>
            </div>
            <div class="mt-1 truncate text-[0.62rem] leading-4 text-ink-muted" title={problem ? cronErrorText(job) : cronJobPreview(job)}>
              {problem ? cronErrorText(job) : cronJobPreview(job)}
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-secondary">next {formatCronRelativeTime(job.next_run_at)}</span>
              <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-ink-muted">{cronJobScheduleLabel(job)}</span>
              <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-ink-muted">{cronJobProfile(job)}</span>
              <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-ink-muted">{cronJobModeLabel(job)}</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  {#if cronError && cronFocusJobs.length > 0}
    <div class="rounded-none border border-warning/40 bg-warning/10 p-2 text-[0.62rem] leading-4 text-warning">
      Last sync failed: {cronError}
    </div>
  {/if}

  <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[0.62rem] uppercase tracking-[0.12em]">
    <span class="min-w-0 truncate text-ink-faint" title={`jobs=${cronJobs.length} · alerts=${cronAlertJobs} · profile=all`}>
      profile=all · jobs={formatDashboardCount(cronJobs.length)}
    </span>
    <Button size="sm" chrome="ghost" variant="secondary" class="rounded-none!" href={cronHref} aria-label="Open Cron Job Manager">
      Open Cron
    </Button>
  </div>
</Panel>
