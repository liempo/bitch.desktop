<script lang="ts">
  import { type ApprovalChoice, promptsState, respondToApproval } from '$lib/stores/prompts.svelte'

  interface Props {
    sessionId?: null | string
  }

  let { sessionId = null }: Props = $props()

  const request = $derived(promptsState.approvalRequest)
  const visible = $derived(Boolean(request && (!request.sessionId || !sessionId || request.sessionId === sessionId)))

  function isSubmitting(choice: ApprovalChoice): boolean {
    return promptsState.submitting === `approval:${choice}`
  }

  function respond(choice: ApprovalChoice): void {
    if (promptsState.submitting) return
    void respondToApproval(choice)
  }
</script>

{#if visible && request}
  <section class="border-t border-amber-400/25 bg-amber-400/10 px-4 py-3" aria-label="Approval request">
    <div class="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="min-w-0">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-200/70">Approval required</p>
        <p class="mt-1 text-sm font-medium text-amber-50">{request.description || 'Hermes wants to run a guarded command.'}</p>
        {#if request.command.trim()}
          <pre class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-xs leading-5 text-slate-200">{request.command.trim()}</pre>
        {/if}
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <button class="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('once')}>{isSubmitting('once') ? 'Sending…' : 'Run once'}</button>
        <button class="rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('session')}>{isSubmitting('session') ? 'Sending…' : 'Allow session'}</button>
        <button class="rounded-lg border border-purple-300/30 bg-purple-300/10 px-3 py-2 text-xs font-semibold text-purple-100 transition hover:bg-purple-300/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('always')}>{isSubmitting('always') ? 'Sending…' : 'Always allow'}</button>
        <button class="rounded-lg border border-red-300/30 bg-red-300/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-300/20 disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('deny')}>{isSubmitting('deny') ? 'Sending…' : 'Deny'}</button>
      </div>
    </div>
    {#if promptsState.error}
      <p class="mx-auto mt-2 max-w-5xl text-xs text-red-300">{promptsState.error}</p>
    {/if}
  </section>
{/if}
