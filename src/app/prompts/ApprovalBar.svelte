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
  <section class="border-t border-warning/35 bg-warning/5 px-4 py-3" aria-label="Approval request">
    <div class="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="min-w-0">
        <p class="cli-section-title text-warning">Approval required</p>
        <p class="mt-1 text-sm font-medium text-ink-bright">{request.description || 'Hermes wants to run a guarded command.'}</p>
        {#if request.command.trim()}
          <pre class="cli-terminal mt-2 max-h-24 overflow-auto whitespace-pre-wrap border-warning/30 px-3 py-2 text-xs leading-5 text-ink">{request.command.trim()}</pre>
        {/if}
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <button class="bitch-button bitch-button-success" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('once')}>{isSubmitting('once') ? 'Sending…' : 'Run once'}</button>
        <button class="bitch-button bitch-button-primary" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('session')}>{isSubmitting('session') ? 'Sending…' : 'Allow session'}</button>
        <button class="bitch-button text-secondary" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('always')}>{isSubmitting('always') ? 'Sending…' : 'Always allow'}</button>
        <button class="bitch-button bitch-button-danger" disabled={Boolean(promptsState.submitting)} type="button" onclick={() => respond('deny')}>{isSubmitting('deny') ? 'Sending…' : 'Deny'}</button>
      </div>
    </div>
    {#if promptsState.error}
      <p class="mx-auto mt-2 max-w-5xl text-xs text-danger">{promptsState.error}</p>
    {/if}
  </section>
{/if}
