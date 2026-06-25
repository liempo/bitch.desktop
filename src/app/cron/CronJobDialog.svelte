<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import TextArea from '@/app/components/ui/TextArea.svelte'
  import TextInput from '@/app/components/ui/TextInput.svelte'
  import { cronJobTitle, type CronDeliveryTarget, type CronJob } from '$lib/hermes/cron'
  import { emptyCronForm, type CronForm } from './cron-form'

  interface Props {
    deliveryTargetNote?: string
    deliveryTargets?: CronDeliveryTarget[]
    editingJob?: CronJob | null
    error?: string
    form?: CronForm
    onCancel: () => void
    onSubmit: (event: SubmitEvent) => void | Promise<void>
    open?: boolean
    saving?: boolean
  }

  let {
    deliveryTargetNote = '',
    deliveryTargets = [],
    editingJob = null,
    error = '',
    form = $bindable(emptyCronForm()),
    onCancel,
    onSubmit,
    open = $bindable(false),
    saving = false
  }: Props = $props()

  const labelClass = 'grid gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted'
  const inputClass = 'px-2 py-1.5 text-sm normal-case tracking-normal'
  const modeTitle = $derived(editingJob ? 'Edit Job' : 'Create Job')
  const dialogDescription = $derived(editingJob ? `editing ${cronJobTitle(editingJob)}` : 'remote scheduler payload')

  function deliveryTargetLabel(target: CronDeliveryTarget): string {
    return target.home_target_set === false ? `${target.name || target.id} (needs home target)` : target.name || target.id
  }
</script>

<Dialog
  bind:open
  title={modeTitle}
  description={dialogDescription}
  class="w-[min(40rem,calc(100vw-2rem))]"
  contentClass="max-h-[min(42rem,calc(100vh-7rem))] overflow-y-auto p-3"
>
  <form class="grid gap-3" onsubmit={onSubmit}>
    {#if error}
      <div class="rounded-control border border-danger/40 bg-danger/10 p-2 text-xs leading-5 text-danger" role="alert">
        {error}
      </div>
    {/if}

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label class={labelClass}>
        Profile
        <TextInput class={inputClass} bind:value={form.profile} placeholder="default" />
      </label>

      <label class={labelClass}>
        Name
        <TextInput class={inputClass} bind:value={form.name} placeholder="Daily briefing" />
      </label>
    </div>

    <label class={labelClass}>
      Schedule
      <TextInput class={inputClass} bind:value={form.schedule} placeholder="every 1h, 0 9 * * *, or 2026-06-20T09:00" />
    </label>

    <label class={labelClass}>
      Prompt
      <TextArea class={inputClass} bind:value={form.prompt} rows={5} placeholder="Self-contained cron prompt" />
    </label>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label class={labelClass}>
        Skills
        <TextInput class={inputClass} bind:value={form.skills} placeholder="maps, blogwatcher" />
      </label>
      <label class={labelClass}>
        Toolsets
        <TextInput class={inputClass} bind:value={form.enabled_toolsets} placeholder="web, terminal" />
      </label>
    </div>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label class={labelClass}>
        Provider
        <TextInput class={inputClass} bind:value={form.provider} placeholder="openrouter" />
      </label>
      <label class={labelClass}>
        Model
        <TextInput class={inputClass} bind:value={form.model} placeholder="anthropic/claude-sonnet-4" />
      </label>
    </div>

    <label class={labelClass}>
      Delivery
      <TextInput class={inputClass} bind:value={form.deliver} list="cron-delivery-targets" placeholder="local, origin, all, telegram:..." />
      <datalist id="cron-delivery-targets">
        {#each deliveryTargets as target (target.id)}
          <option value={target.id} label={deliveryTargetLabel(target)}></option>
        {/each}
      </datalist>
      {#if deliveryTargetNote}
        <span class="normal-case tracking-normal text-ink-faint">{deliveryTargetNote}</span>
      {/if}
    </label>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label class={labelClass}>
        Script
        <TextInput class={inputClass} bind:value={form.script} placeholder="scripts/watchdog.sh" />
      </label>

      <label class={labelClass}>
        Workdir
        <TextInput class={inputClass} bind:value={form.workdir} placeholder="/opt/data/project" />
      </label>
    </div>

    <label class="inline-flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">
      <input bind:checked={form.no_agent} type="checkbox" class="accent-primary" />
      No-agent mode
    </label>

    <label class={labelClass}>
      Context jobs
      <TextInput class={inputClass} bind:value={form.context_from} placeholder="job_id_a, job_id_b" />
    </label>

    <div class="flex flex-col gap-2 border-t border-line/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
      <span class="min-w-0 text-[0.68rem] leading-4 text-ink-muted">
        {#if editingJob}
          Updating {cronJobTitle(editingJob)}.
        {:else}
          Advanced fields are patched after create for legacy dashboard backends.
        {/if}
      </span>
      <div class="flex shrink-0 justify-end gap-2">
        <Button size="sm" chrome="ghost" onclick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : modeTitle}</Button>
      </div>
    </div>
  </form>
</Dialog>
