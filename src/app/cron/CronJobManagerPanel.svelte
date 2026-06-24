<script lang="ts">
  import { onMount } from 'svelte'
  import { Popover } from 'bits-ui'

  import Button from '@/app/components/ui/Button.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { menuItemClass, popoverClass } from '@/app/components/ui/styles'
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
  } from '$lib/hermes/cron'
  import { messageForError } from '$lib/errors'
  import {
    ensureGatewayProfile,
    normalizeProfileKey,
    profileState,
    refreshActiveProfile,
    sortByProfileOrder
  } from '$lib/hermes/profiles'
  import type { ProfileInfo, SessionInfo } from '$lib/types/hermes'
  import { agentRoute } from '../router.svelte'
  import CronJobDialog from './CronJobDialog.svelte'
  import { emptyCronForm, type CronForm } from './cron-form'

  interface ProfileChoice {
    isDefault: boolean
    name: string
  }

  const pillClass = 'inline-block max-w-full truncate rounded-none border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[0.58rem] text-ink-muted'
  const profileTagClass = 'inline-block max-w-[7rem] truncate rounded-none border border-line bg-surface-raised px-1.5 py-0.5 font-hud text-[0.58rem] font-bold uppercase tracking-[0.08em] text-ink-muted sm:max-w-[10rem] lg:max-w-[14rem]'
  const scheduleTagClass = 'inline-block max-w-[7rem] truncate rounded-none border border-line/70 bg-canvas px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-ink-faint sm:max-w-[16rem] lg:max-w-none'
  const profileTriggerClass = [
    'inline-block max-w-[7.5rem] truncate align-middle sm:max-w-[12rem]',
    'font-mono text-[11px] font-bold uppercase tracking-[0.05em]',
    'text-ink-muted hover:text-ink-bright',
    'before:mr-1 before:text-line-strong before:content-[\'[\'] after:ml-1 after:text-line-strong after:content-[\']\']',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-ink-muted'
  ].join(' ')
  const profileMenuContentClass = `${popoverClass} z-50 w-60 p-1.5 font-mono`
  const profileMenuItemBaseClass = `${menuItemClass} flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] uppercase tracking-[0.08em]`

  let jobs = $state<CronJob[]>([])
  let deliveryTargets = $state<CronDeliveryTarget[]>([])
  let selectedProfile = $state('all')
  let profileMenuOpen = $state(false)
  let loading = $state(true)
  let saving = $state(false)
  let actionBusyKey = $state<null | string>(null)
  let expandedJobKey = $state<null | string>(null)
  let runsLoadingKey = $state<null | string>(null)
  let runsByJob = $state<Record<string, SessionInfo[]>>({})
  let errorMessage = $state('')
  let formError = $state('')
  let noticeMessage = $state('')
  let editingJob = $state<CronJob | null>(null)
  let jobDialogOpen = $state(false)
  let form = $state<CronForm>(emptyCronForm())

  const activeProfileName = $derived(selectedProfile === 'all' ? 'all' : normalizeProfileKey(selectedProfile))
  const profileLabel = $derived(activeProfileName)
  const profileMenuChoices = $derived(profileChoicesFor(profileState.profiles, activeProfileName))
  const deliveryTargetNote = $derived.by(() => deliveryTargetDescription(form.deliver))

  onMount(() => {
    void initializeCronPage()
  })

  async function initializeCronPage(): Promise<void> {
    await refreshActiveProfile()
    if (!form.profile || form.profile === 'default') form.profile = profileState.activeGatewayProfile || 'default'
    await Promise.all([loadJobs(), loadDeliveryTargets()])
  }

  function activeFormProfile(): string {
    return selectedProfile === 'all' ? profileState.activeGatewayProfile || 'default' : selectedProfile
  }

  function jobKey(job: CronJob): string {
    return `${cronJobProfile(job)}:${job.id}`
  }

  function dateFromCronTime(value?: null | number | string): Date | null {
    if (value === null || value === undefined || value === '') return null
    const date = typeof value === 'number' ? new Date(value < 10_000_000_000 ? value * 1000 : value) : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  function formatTime(value?: null | number | string): string {
    if (value === null || value === undefined || value === '') return '—'
    return dateFromCronTime(value)?.toLocaleString() ?? String(value)
  }

  function formatTagTime(value?: null | number | string): string {
    const date = dateFromCronTime(value)
    if (!date) return value === null || value === undefined || value === '' ? '' : String(value)

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const dayOffset = Math.round((targetDay - today) / 86_400_000)
    const dayLabel =
      dayOffset === 0
        ? 'today'
        : dayOffset === 1
          ? 'tomorrow'
          : dayOffset === -1
            ? 'yesterday'
            : date.toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
              })
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const hour = hours % 12 || 12
    const period = hours < 12 ? 'AM' : 'PM'
    const timeLabel = minutes > 0 ? `${hour}:${String(minutes).padStart(2, '0')}${period}` : `${hour}${period}`

    return `${dayLabel} ${timeLabel}`
  }

  function truncate(value: null | string | undefined, maxLength = 140): string {
    const text = value?.trim() ?? ''
    if (!text) return '—'
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
  }

  function statusClass(job: CronJob): string {
    const state = cronJobState(job)
    const base = 'inline-block max-w-[12rem] truncate rounded-none border px-1.5 py-0.5 font-hud text-[0.58rem] font-bold uppercase tracking-[0.08em] sm:max-w-none'
    if (isProblemJob(job)) return `${base} border-danger/50 bg-danger/10 text-danger`
    if (state === 'paused') return `${base} border-warning/50 bg-warning/10 text-warning`
    return `${base} border-success/50 bg-success/10 text-success`
  }

  function statusLabel(job: CronJob): string {
    if (isProblemJob(job)) return 'Alert'

    const state = cronJobState(job).toLowerCase()
    if (state === 'scheduled') {
      const nextRun = formatTagTime(job.next_run_at)
      return nextRun ? `Scheduled ${nextRun}` : 'Scheduled'
    }

    return state ? `${state.slice(0, 1).toUpperCase()}${state.slice(1)}` : 'Scheduled'
  }

  function statusTitle(job: CronJob): string {
    return cronJobState(job).toLowerCase() === 'scheduled' && job.next_run_at ? `Next run: ${formatTime(job.next_run_at)}` : statusLabel(job)
  }

  function scheduleLabel(job: CronJob): string {
    const schedule = cronJobScheduleLabel(job)
    return schedule === '—' ? '' : schedule
  }

  function isProblemJob(job: CronJob): boolean {
    const state = cronJobState(job).toLowerCase()
    const lastStatus = job.last_status?.toLowerCase() ?? ''
    return Boolean(job.last_error || job.last_delivery_error || ['error', 'failed'].includes(state) || ['error', 'failed'].includes(lastStatus))
  }

  function jobSummary(job: CronJob): string {
    return truncate(job.prompt || job.script, 180)
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

  function profileChoiceKey(profile: ProfileChoice): string {
    return profile.name === 'all' ? 'all' : normalizeProfileKey(profile.name)
  }

  function profileChoicesFor(profiles: ProfileInfo[], currentProfile: string): ProfileChoice[] {
    const defaults = profiles.filter(profile => profile.is_default)
    const rest = sortByProfileOrder(profiles.filter(profile => !profile.is_default))
    const choices: ProfileChoice[] = [{ isDefault: false, name: 'all' }]
    const seen = new Set<string>(['all'])

    for (const profile of [...defaults, ...rest]) {
      const key = normalizeProfileKey(profile.name)
      if (seen.has(key)) continue
      seen.add(key)
      choices.push({ isDefault: profile.is_default, name: profile.name })
    }

    const current = currentProfile === 'all' ? 'all' : normalizeProfileKey(currentProfile)
    if (!seen.has(current)) choices.splice(1, 0, { isDefault: current === 'default', name: current })

    return choices
  }

  function profileChoiceLabel(profile: ProfileChoice): string {
    if (profile.name === 'all') return 'all'
    return profile.isDefault || normalizeProfileKey(profile.name) === 'default' ? 'default' : profile.name
  }

  function profileChoiceClass(profile: ProfileChoice): string {
    const selected = profileChoiceKey(profile) === activeProfileName
    return selected ? `${profileMenuItemBaseClass} border-primary/40 bg-primary/10 text-primary` : profileMenuItemBaseClass
  }

  async function handleProfileSelect(profile: string): Promise<void> {
    const nextProfile = profile === 'all' ? 'all' : normalizeProfileKey(profile)
    profileMenuOpen = false

    if (nextProfile === selectedProfile) return

    selectedProfile = nextProfile
    expandedJobKey = null
    editingJob = null
    jobDialogOpen = false
    form = emptyCronForm(activeFormProfile())
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
      formError = validation
      return
    }

    saving = true
    formError = ''
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
      jobDialogOpen = false
      form = emptyCronForm(activeFormProfile())
      await loadJobs()
    } catch (error) {
      formError = `Save failed: ${messageForError(error)}`
    } finally {
      saving = false
    }
  }

  function formFromJob(job: CronJob): CronForm {
    return {
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

  function startCreateJob(): void {
    formError = ''
    editingJob = null
    form = emptyCronForm(activeFormProfile())
    jobDialogOpen = true
  }

  function editJob(job: CronJob): void {
    formError = ''
    editingJob = job
    form = formFromJob(job)
    jobDialogOpen = true
  }

  function cancelJobDialog(): void {
    formError = ''
    editingJob = null
    jobDialogOpen = false
    form = emptyCronForm(activeFormProfile())
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

<div class="h-full min-h-0">
  <Panel title="JOBS" padded={false} contentClass="flex min-h-0 flex-col gap-2 p-3" class="min-h-128 md:min-h-0">
    {#snippet actions()}
      <Popover.Root bind:open={profileMenuOpen}>
        <Popover.Trigger
          class={profileTriggerClass}
          disabled={loading}
          title="Filter cron jobs by profile"
          aria-label="Filter cron jobs by profile"
        >
          profile:{profileLabel}
        </Popover.Trigger>

        <Popover.Content class={profileMenuContentClass} sideOffset={4} align="end">
          <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            job profile filter
          </div>
          <div class="grid gap-1">
            {#each profileMenuChoices as profile (profileChoiceKey(profile))}
              {@const selected = profileChoiceKey(profile) === activeProfileName}
              <button
                class={profileChoiceClass(profile)}
                type="button"
                onclick={() => void handleProfileSelect(profile.name)}
                aria-pressed={selected}
              >
                <span class="min-w-0 truncate">profile:{profileChoiceLabel(profile)}</span>
                {#if selected}
                  <span class="shrink-0 text-primary">active</span>
                {/if}
              </button>
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
      <Button
        variant="unstyled"
        class="flex h-5 w-6 items-center justify-center p-0 text-ink-muted hover:text-ink-bright"
        onclick={startCreateJob}
        aria-label="New cron job"
        title="New cron job"
      >
        +
      </Button>
      <Button
        variant="unstyled"
        class="flex h-5 w-6 items-center justify-center p-0 text-ink-muted hover:text-ink-bright"
        onclick={() => loadJobs()}
        disabled={loading}
        aria-label="Refresh cron jobs"
        title="Refresh cron jobs"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.2 6.7L4 9m2 6a7 7 0 0 0 11.8 2.3L20 15" />
        </svg>
      </Button>
    {/snippet}

    {#if noticeMessage}
      <div class="shrink-0 rounded-panel border border-success/40 bg-success/10 p-3 text-sm leading-6 text-success" role="status">{noticeMessage}</div>
    {/if}
    {#if errorMessage}
      <div class="shrink-0 rounded-panel border border-danger/40 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">{errorMessage}</div>
    {/if}
    <div class="min-h-0 flex-1 overflow-auto p-1" style="--custom-scrollbar-offset-x: 4px" data-selectable="true" aria-label="Cron jobs">
      {#if loading}
        <div class="flex h-full items-center justify-center" aria-label="Loading cron jobs">
          <Loader size="xl" label="Loading cron jobs" />
        </div>
      {:else if jobs.length === 0}
        <div class="border border-dashed border-line p-3 text-[0.68rem] text-ink-muted">
          No cron jobs visible for this profile filter.
        </div>
      {:else}
        <div class="grid gap-1">
          {#each jobs as job (jobKey(job))}
            {@const state = cronJobState(job)}
            {@const profile = cronJobProfile(job)}
            {@const key = jobKey(job)}
            {@const runs = runsByJob[key] ?? []}
            {@const schedule = scheduleLabel(job)}
            <div class="border border-line bg-canvas">
              <div class="px-2 py-1.5">
                <div class="min-w-0">
                  <div class="truncate text-[0.76rem] font-semibold text-ink-bright" title={cronJobTitle(job)}>{cronJobTitle(job)}</div>
                  <p class="line-clamp-3 text-[0.62rem] leading-4 text-ink-muted wrap-anywhere" title={jobSummary(job)}>{jobSummary(job)}</p>

                  {#if job.last_error || job.last_delivery_error}
                    <div class="mt-1.5 border border-danger/40 bg-danger/10 p-1.5 text-[0.62rem] leading-4 text-danger">
                      {#if job.last_error}<div>Run failure: {job.last_error}</div>{/if}
                      {#if job.last_delivery_error}<div>Delivery failure: {job.last_delivery_error}</div>{/if}
                    </div>
                  {/if}
                </div>
              </div>

              <footer class="grid gap-1.5 border-t border-line/50 bg-surface-raised/25 px-2 py-1.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-2">
                <div class="flex min-w-0 flex-wrap items-center gap-1">
                  <span class={profileTagClass} title={`Profile: ${profile}`}>{profile}</span>
                  <span class={statusClass(job)} title={statusTitle(job)}>{statusLabel(job)}</span>
                  {#if schedule}
                    <span class={scheduleTagClass} title={`Schedule: ${schedule}`}>{schedule}</span>
                  {/if}
                </div>
                <div class="flex min-w-0 flex-wrap gap-1 md:justify-end">
                  <Button size="sm" chrome="ghost" onclick={() => editJob(job)}>Edit</Button>
                  <Button size="sm" chrome="ghost" variant="primary" onclick={() => trigger(job)} disabled={actionBusyKey === key}>Run</Button>
                  <Button size="sm" chrome="ghost" variant={state === 'paused' ? 'success' : 'warning'} onclick={() => pauseOrResume(job)} disabled={actionBusyKey === key}>
                    {state === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                  <Button size="sm" chrome="ghost" variant="secondary" onclick={() => toggleRuns(job)} disabled={runsLoadingKey === key}>
                    Runs
                  </Button>
                  <Button size="sm" chrome="ghost" variant="danger" onclick={() => remove(job)} disabled={actionBusyKey === key}>Remove</Button>
                </div>
              </footer>

              {#if expandedJobKey === key}
                <section class="border-t border-line bg-surface-raised/45 p-2" aria-label="Recent run output">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <h3 class="font-hud text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-muted">Recent run output</h3>
                    <span class="font-mono text-[0.62rem] text-ink-faint">{runs.length}/5</span>
                  </div>
                  {#if runsLoadingKey === key}
                    <div class="py-2 text-xs text-primary">Loading recent run output…</div>
                  {:else if runs.length === 0}
                    <div class="border border-dashed border-line p-2 text-xs text-ink-muted">No recorded run sessions for this job.</div>
                  {:else}
                    <div class="grid gap-1">
                      {#each runs as run (run.id)}
                        <article class="border border-line bg-canvas px-2 py-1.5 text-xs leading-5">
                          <div class="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                            <a class="min-w-0 break-all font-semibold text-primary hover:text-ink-bright" href={`#${agentRoute(run.id)}`}>{runTitle(run)}</a>
                            <span class={pillClass}>{runStatus(run)}</span>
                            <span class="font-mono text-[0.62rem] text-ink-faint">{formatTime(run.started_at)}</span>
                          </div>
                          <p class="wrap-break-word text-ink-muted">{runPreview(run)}</p>
                          {#if run.model || run.profile}
                            <div class="mt-1 font-mono text-[0.62rem] text-ink-faint">{run.profile || profile} · {run.model || 'default model'}</div>
                          {/if}
                        </article>
                      {/each}
                    </div>
                  {/if}
                </section>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </Panel>
</div>

<CronJobDialog
  bind:form
  bind:open={jobDialogOpen}
  deliveryTargetNote={deliveryTargetNote}
  deliveryTargets={deliveryTargets}
  editingJob={editingJob}
  error={formError}
  onCancel={cancelJobDialog}
  onSubmit={saveJob}
  saving={saving}
/>
