<script lang="ts">
  import { onMount } from 'svelte'

  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import TextArea from '@/app/components/ui/TextArea.svelte'
  import TextInput from '@/app/components/ui/TextInput.svelte'
  import {
    createCronJob,
    cronJobProfile,
    cronJobScheduleLabel,
    cronJobState,
    cronJobTitle,
    deleteCronJob,
    getCronDeliveryTargets,
    getCronJobRuns,
    getCronJobs,
    pauseCronJob,
    resumeCronJob,
    runCronJob,
    updateCronJob,
    type CronDeliveryTarget,
    type CronJob,
    type CronJobPayloadInput
  } from '$lib/api/cron'
  import { messageForError } from '$lib/errors'
  import { ensureGatewayProfile, profileState, refreshActiveProfile } from '$lib/stores/profile.svelte'
  import type { SessionInfo } from '$lib/types/hermes'
  import { agentRoute } from '../router.svelte'

  interface CronForm {
    context_from: string
    deliver: string
    enabled_toolsets: string
    model: string
    name: string
    no_agent: boolean
    profile: string
    prompt: string
    provider: string
    schedule: string
    script: string
    skills: string
    workdir: string
  }

  const labelClass = 'grid gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted'
  const selectClass = 'rounded-control border border-line bg-canvas px-2 py-1 text-sm normal-case tracking-normal text-ink-bright'
  const pillClass = 'rounded-control border border-line bg-canvas px-1.5 py-1 font-mono text-[0.62rem] text-ink-muted'

  let jobs = $state<CronJob[]>([])
  let deliveryTargets = $state<CronDeliveryTarget[]>([])
  let selectedProfile = $state('all')
  let loading = $state(true)
  let saving = $state(false)
  let actionBusyKey = $state<null | string>(null)
  let expandedJobKey = $state<null | string>(null)
  let runsLoadingKey = $state<null | string>(null)
  let runsByJob = $state<Record<string, SessionInfo[]>>({})
  let errorMessage = $state('')
  let noticeMessage = $state('')
  let editingJob = $state<CronJob | null>(null)
  let form = $state<CronForm>(emptyForm())

  const formMode = $derived(editingJob ? 'Edit job' : 'Create job')
  const jobCountLabel = $derived(loading ? 'SYNC' : `${jobs.length}`)
  const selectedProfileLabel = $derived(selectedProfile === 'all' ? 'all profiles' : selectedProfile)
  const profileOptions = $derived.by(() => {
    const names = new Set<string>(['all', selectedProfile, profileState.activeGatewayProfile || 'default'])
    for (const profile of profileState.profiles) names.add(profile.name)
    const sortedProfiles = [...names].filter(name => name && name !== 'all').sort((a, b) => a.localeCompare(b))
    return ['all', ...sortedProfiles]
  })
  const deliveryTargetNote = $derived.by(() => deliveryTargetDescription(form.deliver))

  onMount(() => {
    void initializeCronPage()
  })

  function emptyForm(profile = 'default'): CronForm {
    return {
      context_from: '',
      deliver: 'local',
      enabled_toolsets: '',
      model: '',
      name: '',
      no_agent: false,
      profile,
      prompt: '',
      provider: '',
      schedule: 'every 1h',
      script: '',
      skills: '',
      workdir: ''
    }
  }

  async function initializeCronPage(): Promise<void> {
    await refreshActiveProfile()
    if (!form.profile || form.profile === 'default') form.profile = profileState.activeGatewayProfile || 'default'
    await Promise.all([loadJobs(), loadDeliveryTargets()])
  }

  function jobKey(job: CronJob): string {
    return `${cronJobProfile(job)}:${job.id}`
  }

  function formatTime(value?: null | number | string): string {
    if (value === null || value === undefined || value === '') return '—'
    const date = typeof value === 'number' ? new Date(value < 10_000_000_000 ? value * 1000 : value) : new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }

  function truncate(value: null | string | undefined, maxLength = 140): string {
    const text = value?.trim() ?? ''
    if (!text) return '—'
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
  }

  function statusClass(state: string): string {
    const base = 'rounded-control border px-1.5 py-1 font-hud text-[0.58rem] font-bold uppercase tracking-[0.12em]'
    if (state === 'paused') return `${base} border-warning/50 bg-warning/10 text-warning`
    if (state === 'error' || state === 'failed' || state === 'completed') return `${base} border-danger/50 bg-danger/10 text-danger`
    return `${base} border-success/50 bg-success/10 text-success`
  }

  function jobSummary(job: CronJob): string {
    return truncate(job.prompt || job.script, 220)
  }

  function modelLabel(job: CronJob): string {
    const provider = job.provider?.trim() || 'default provider'
    const model = job.model?.trim() || 'default model'
    return `${provider} / ${model}`
  }

  function runStatus(run: SessionInfo): string {
    if (run.is_active) return 'active'
    return run.ended_at == null ? 'pending' : 'ended'
  }

  function runTitle(run: SessionInfo): string {
    return run.title?.trim() || run.preview?.trim()?.slice(0, 80) || run.id
  }

  function runPreview(run: SessionInfo): string {
    return truncate(run.preview, 260)
  }

  function deliveryTargetDescription(deliver: string): string {
    const id = deliver.trim()
    if (!id) return ''
    const target = deliveryTargets.find(item => item.id === id)
    if (!target) return 'Custom delivery target; passed through to the dashboard cron API.'
    if (target.home_target_set === false) return `${target.name || target.id} is configured, but its home channel is not set.`
    return target.name || target.id
  }

  function deliveryTargetLabel(target: CronDeliveryTarget): string {
    return target.home_target_set === false ? `${target.name || target.id} (needs home target)` : target.name || target.id
  }

  async function loadDeliveryTargets(): Promise<void> {
    try {
      const response = await getCronDeliveryTargets()
      deliveryTargets = response.targets
    } catch {
      deliveryTargets = []
    }
  }

  async function loadJobs(): Promise<void> {
    loading = true
    errorMessage = ''
    try {
      if (selectedProfile !== 'all') await ensureGatewayProfile(selectedProfile)
      jobs = await getCronJobs(selectedProfile)
    } catch (error) {
      errorMessage = `Cron jobs unavailable: ${messageForError(error)}`
      jobs = []
    } finally {
      loading = false
    }
  }

  async function handleProfileChange(event: Event): Promise<void> {
    const target = event.currentTarget as HTMLSelectElement
    selectedProfile = target.value || 'all'
    expandedJobKey = null
    editingJob = null
    form = emptyForm(selectedProfile === 'all' ? profileState.activeGatewayProfile || 'default' : selectedProfile)
    await loadJobs()
  }

  function payloadFromForm(): CronJobPayloadInput {
    return {
      context_from: form.context_from,
      deliver: form.deliver || 'local',
      enabled_toolsets: form.enabled_toolsets,
      model: form.model,
      name: form.name,
      no_agent: form.no_agent,
      prompt: form.prompt,
      provider: form.provider,
      schedule: form.schedule,
      script: form.script,
      skills: form.skills,
      workdir: form.workdir
    }
  }

  function validateForm(): string {
    if (!form.profile.trim()) return 'Profile is required.'
    if (!form.schedule.trim()) return 'Schedule is required.'
    if (!form.deliver.trim()) return 'Delivery target is required.'
    if (form.no_agent && !form.script.trim()) return 'No-agent mode requires a Script.'
    if (!form.no_agent && !form.prompt.trim() && !form.script.trim()) return 'Prompt or Script is required.'
    return ''
  }

  async function saveJob(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const validation = validateForm()
    if (validation) {
      errorMessage = validation
      return
    }

    saving = true
    errorMessage = ''
    noticeMessage = ''
    const profile = form.profile.trim() || 'default'

    try {
      if (editingJob) {
        await updateCronJob(editingJob.id, payloadFromForm(), profile)
        noticeMessage = `Updated cron job ${cronJobTitle(editingJob)}.`
      } else {
        const created = await createCronJob(payloadFromForm(), profile)
        noticeMessage = `Created cron job ${cronJobTitle(created)}.`
      }
      editingJob = null
      form = emptyForm(selectedProfile === 'all' ? profileState.activeGatewayProfile || 'default' : selectedProfile)
      await loadJobs()
    } catch (error) {
      errorMessage = `Save failed: ${messageForError(error)}`
    } finally {
      saving = false
    }
  }

  function editJob(job: CronJob): void {
    editingJob = job
    form = {
      context_from: job.context_from?.join(', ') ?? '',
      deliver: job.deliver ?? 'local',
      enabled_toolsets: job.enabled_toolsets?.join(', ') ?? '',
      model: job.model ?? '',
      name: job.name ?? '',
      no_agent: job.no_agent === true,
      profile: cronJobProfile(job),
      prompt: job.prompt ?? '',
      provider: job.provider ?? '',
      schedule: typeof job.schedule === 'string' ? job.schedule : job.schedule?.expr ?? job.schedule?.display ?? job.schedule_display ?? '',
      script: job.script ?? '',
      skills: job.skills?.join(', ') ?? '',
      workdir: job.workdir ?? ''
    }
  }

  function cancelEdit(): void {
    editingJob = null
    form = emptyForm(selectedProfile === 'all' ? profileState.activeGatewayProfile || 'default' : selectedProfile)
  }

  async function withRowAction(job: CronJob, label: string, action: () => Promise<unknown>): Promise<void> {
    const key = jobKey(job)
    actionBusyKey = key
    errorMessage = ''
    noticeMessage = ''
    try {
      await action()
      noticeMessage = `${label}: ${cronJobTitle(job)}`
      await loadJobs()
    } catch (error) {
      errorMessage = `${label} failed: ${messageForError(error)}`
    } finally {
      actionBusyKey = null
    }
  }

  async function pauseOrResume(job: CronJob): Promise<void> {
    const state = cronJobState(job)
    const profile = cronJobProfile(job)
    if (state === 'paused') {
      await withRowAction(job, 'Resume', () => resumeCronJob(job.id, profile))
    } else {
      await withRowAction(job, 'Pause', () => pauseCronJob(job.id, profile))
    }
  }

  async function trigger(job: CronJob): Promise<void> {
    await withRowAction(job, 'Run now', () => runCronJob(job.id, cronJobProfile(job)))
  }

  async function remove(job: CronJob): Promise<void> {
    const confirmed = window.confirm(`Remove cron job ${cronJobTitle(job)}?`)
    if (!confirmed) return
    await withRowAction(job, 'Remove', () => deleteCronJob(job.id, cronJobProfile(job)))
  }

  async function toggleRuns(job: CronJob): Promise<void> {
    const key = jobKey(job)
    if (expandedJobKey === key) {
      expandedJobKey = null
      return
    }

    expandedJobKey = key
    runsLoadingKey = key
    errorMessage = ''
    try {
      const response = await getCronJobRuns(job.id, cronJobProfile(job), 5)
      runsByJob = { ...runsByJob, [key]: response.runs }
    } catch (error) {
      errorMessage = `Recent run output failed: ${messageForError(error)}`
      runsByJob = { ...runsByJob, [key]: [] }
    } finally {
      runsLoadingKey = null
    }
  }
</script>

<section
  class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-chat-scroll/40 p-3 md:overflow-hidden md:p-4"
  aria-label="Cron Job Manager"
>
  <Panel title="Cron Job Manager" badge={selectedProfileLabel} padded={false} fullHeight={false} contentClass="p-3" actions={pageActions}>
    <div class="grid gap-3 md:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)] md:items-end">
      <label class="flex flex-col gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">
        Remote profile
        <select class={selectClass} bind:value={selectedProfile} onchange={handleProfileChange}>
          {#each profileOptions as profile}
            <option value={profile}>{profile === 'all' ? 'All profiles' : profile}</option>
          {/each}
        </select>
      </label>
      <div class="text-xs leading-5 text-ink-muted">
        Inspect, create, edit, pause, resume, remove, and run Hermes scheduler jobs through authenticated dashboard cron endpoints.
        <span class="font-mono text-[0.68rem] text-ink-faint"> jobs={jobs.length} · profile={selectedProfileLabel}</span>
      </div>
    </div>
  </Panel>

  {#if noticeMessage}
    <div class="rounded-panel border border-success/40 bg-success/10 p-3 text-sm leading-6 text-success">{noticeMessage}</div>
  {/if}
  {#if errorMessage}
    <div class="rounded-panel border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">{errorMessage}</div>
  {/if}

  <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(19rem,25rem)_minmax(0,1fr)]">
    <Panel title={formMode} padded={false} contentClass="min-h-0 overflow-auto p-3" class="min-h-[30rem] xl:min-h-0">
      <form class="grid gap-3" onsubmit={saveJob}>
        <label class={labelClass}>
          Profile
          <TextInput bind:value={form.profile} placeholder="default" />
        </label>

        <label class={labelClass}>
          Name
          <TextInput bind:value={form.name} placeholder="Daily briefing" />
        </label>

        <label class={labelClass}>
          Schedule
          <TextInput bind:value={form.schedule} placeholder="every 1h, 0 9 * * *, or 2026-06-20T09:00" />
        </label>

        <label class={labelClass}>
          Prompt
          <TextArea bind:value={form.prompt} rows={5} placeholder="Self-contained cron prompt" />
        </label>

        <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <label class={labelClass}>
            Skills
            <TextInput bind:value={form.skills} placeholder="maps, blogwatcher" />
          </label>
          <label class={labelClass}>
            Toolsets
            <TextInput bind:value={form.enabled_toolsets} placeholder="web, terminal" />
          </label>
        </div>

        <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <label class={labelClass}>
            Provider
            <TextInput bind:value={form.provider} placeholder="openrouter" />
          </label>
          <label class={labelClass}>
            Model
            <TextInput bind:value={form.model} placeholder="anthropic/claude-sonnet-4" />
          </label>
        </div>

        <label class={labelClass}>
          Delivery
          <TextInput bind:value={form.deliver} list="cron-delivery-targets" placeholder="local, origin, all, telegram:..." />
          <datalist id="cron-delivery-targets">
            {#each deliveryTargets as target (target.id)}
              <option value={target.id} label={deliveryTargetLabel(target)}></option>
            {/each}
          </datalist>
          {#if deliveryTargetNote}
            <span class="normal-case tracking-normal text-ink-faint">{deliveryTargetNote}</span>
          {/if}
        </label>

        <label class={labelClass}>
          Script
          <TextInput bind:value={form.script} placeholder="scripts/watchdog.sh" />
        </label>

        <label class="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">
          <input bind:checked={form.no_agent} type="checkbox" class="accent-primary" />
          No-agent mode
        </label>

        <label class={labelClass}>
          Context jobs
          <TextInput bind:value={form.context_from} placeholder="job_id_a, job_id_b" />
        </label>

        <label class={labelClass}>
          Workdir
          <TextInput bind:value={form.workdir} placeholder="/opt/data/project" />
        </label>

        <div class="flex items-center justify-between gap-2 pt-1">
          {#if editingJob}
            <Button size="sm" chrome="ghost" onclick={cancelEdit}>Cancel</Button>
          {:else}
            <span class="text-[0.68rem] leading-4 text-ink-muted">Advanced fields are patched after create for legacy dashboard backends.</span>
          {/if}
          <Button size="sm" variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : formMode}</Button>
        </div>
      </form>
    </Panel>

    <Panel title="Scheduled jobs" badge={jobCountLabel} padded={false} contentClass="flex min-h-0 flex-col p-3" class="min-h-[30rem] xl:min-h-0">
      {#if loading}
        <div class="flex flex-1 items-center justify-center font-hud text-[0.72rem] uppercase tracking-[0.18em] text-primary">Loading cron jobs…</div>
      {:else if jobs.length === 0}
        <div class="flex flex-1 items-center justify-center rounded-panel border border-dashed border-line bg-surface-raised/35 p-6 text-center text-sm text-ink-muted">
          No cron jobs visible for this profile filter.
        </div>
      {:else}
        <div class="min-h-0 flex-1 overflow-auto pr-1" data-selectable="true">
          <div class="grid gap-3">
            {#each jobs as job (jobKey(job))}
              {@const state = cronJobState(job)}
              {@const profile = cronJobProfile(job)}
              {@const key = jobKey(job)}
              {@const runs = runsByJob[key] ?? []}
              <article class="rounded-panel border border-line bg-surface-raised p-3">
                <div class="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-start">
                  <div class="min-w-0 flex-1">
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                      <h2 class="min-w-0 truncate text-sm font-semibold text-ink-bright" title={cronJobTitle(job)}>{cronJobTitle(job)}</h2>
                      <span class={statusClass(state)}>{state}</span>
                      <span class={pillClass}>Profile {profile}</span>
                      <span class={pillClass}>Delivery {job.deliver || 'local'}</span>
                    </div>

                    <p class="mb-2 text-xs leading-5 text-ink-muted">{jobSummary(job)}</p>

                    <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.7rem] leading-5 text-ink-muted md:grid-cols-4">
                      <div>
                        <dt class="font-hud uppercase tracking-[0.12em] text-ink-dim">Schedule</dt>
                        <dd class="truncate font-mono text-ink-bright" title={cronJobScheduleLabel(job)}>{cronJobScheduleLabel(job)}</dd>
                      </div>
                      <div>
                        <dt class="font-hud uppercase tracking-[0.12em] text-ink-dim">Last run</dt>
                        <dd>{formatTime(job.last_run_at)}</dd>
                      </div>
                      <div>
                        <dt class="font-hud uppercase tracking-[0.12em] text-ink-dim">Next run</dt>
                        <dd>{formatTime(job.next_run_at)}</dd>
                      </div>
                      <div>
                        <dt class="font-hud uppercase tracking-[0.12em] text-ink-dim">Model</dt>
                        <dd class="truncate" title={modelLabel(job)}>{modelLabel(job)}</dd>
                      </div>
                    </dl>

                    {#if job.skills?.length || job.enabled_toolsets?.length || job.context_from?.length || job.workdir || job.script || job.no_agent}
                      <div class="mt-2 flex flex-wrap gap-1.5 text-[0.62rem] text-ink-muted">
                        {#if job.skills?.length}<span class={pillClass}>Skills: {job.skills.join(', ')}</span>{/if}
                        {#if job.enabled_toolsets?.length}<span class={pillClass}>Toolsets: {job.enabled_toolsets.join(', ')}</span>{/if}
                        {#if job.context_from?.length}<span class={pillClass}>Context: {job.context_from.join(', ')}</span>{/if}
                        {#if job.workdir}<span class={pillClass}>Workdir: {job.workdir}</span>{/if}
                        {#if job.script}<span class={pillClass}>Script: {job.script}</span>{/if}
                        {#if job.no_agent}<span class="rounded-control border border-warning/50 bg-warning/10 px-1.5 py-1 font-mono text-[0.62rem] text-warning">No-agent mode</span>{/if}
                      </div>
                    {/if}

                    {#if job.last_error || job.last_delivery_error}
                      <div class="mt-3 rounded-control border border-danger/40 bg-danger/10 p-2 text-xs leading-5 text-danger">
                        {#if job.last_error}<div>Run failure: {job.last_error}</div>{/if}
                        {#if job.last_delivery_error}<div>Delivery failure: {job.last_delivery_error}</div>{/if}
                      </div>
                    {/if}
                  </div>

                  <div class="flex flex-wrap gap-2 2xl:w-52 2xl:justify-end">
                    <Button size="sm" chrome="ghost" onclick={() => editJob(job)}>Edit</Button>
                    <Button size="sm" chrome="ghost" variant={state === 'paused' ? 'success' : 'warning'} onclick={() => pauseOrResume(job)} disabled={actionBusyKey === key}>
                      {state === 'paused' ? 'Resume' : 'Pause'}
                    </Button>
                    <Button size="sm" chrome="ghost" variant="primary" onclick={() => trigger(job)} disabled={actionBusyKey === key}>Run now</Button>
                    <Button size="sm" chrome="ghost" variant="secondary" onclick={() => toggleRuns(job)} disabled={runsLoadingKey === key}>
                      {expandedJobKey === key ? 'Hide runs' : 'Recent runs'}
                    </Button>
                    <Button size="sm" chrome="ghost" variant="danger" onclick={() => remove(job)} disabled={actionBusyKey === key}>Remove</Button>
                  </div>
                </div>

                {#if expandedJobKey === key}
                  <section class="mt-3 rounded-panel border border-line bg-canvas/70 p-3" aria-label="Recent run output">
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <h3 class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted">Recent run output</h3>
                      <span class="font-mono text-[0.62rem] text-ink-faint">{runs.length}/5</span>
                    </div>
                    {#if runsLoadingKey === key}
                      <div class="py-3 text-xs text-primary">Loading recent run output…</div>
                    {:else if runs.length === 0}
                      <div class="rounded-control border border-dashed border-line p-3 text-xs text-ink-muted">No recorded run sessions for this job.</div>
                    {:else}
                      <div class="grid gap-2">
                        {#each runs as run (run.id)}
                          <article class="rounded-control border border-line bg-surface px-3 py-2 text-xs leading-5">
                            <div class="mb-1 flex flex-wrap items-center gap-2">
                              <a class="font-semibold text-primary hover:text-ink-bright" href={`#${agentRoute(run.id)}`}>{runTitle(run)}</a>
                              <span class={pillClass}>{runStatus(run)}</span>
                              <span class="font-mono text-[0.62rem] text-ink-faint">{formatTime(run.started_at)}</span>
                            </div>
                            <p class="text-ink-muted">{runPreview(run)}</p>
                            {#if run.model || run.profile}
                              <div class="mt-1 font-mono text-[0.62rem] text-ink-faint">{run.profile || profile} · {run.model || 'default model'}</div>
                            {/if}
                          </article>
                        {/each}
                      </div>
                    {/if}
                  </section>
                {/if}
              </article>
            {/each}
          </div>
        </div>
      {/if}
    </Panel>
  </div>
</section>

{#snippet pageActions()}
  <Button size="sm" chrome="ghost" variant="primary" onclick={() => loadJobs()} disabled={loading}>Refresh</Button>
{/snippet}
