<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import TerminalBlock from '@/app/components/ui/TerminalBlock.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import { type ApprovalChoice, promptsState, respondToApproval } from '$lib/stores/prompts.svelte'

  interface Props {
    sessionId?: null | string
  }

  let { sessionId = null }: Props = $props()

  const request = $derived(promptsState.approvalRequest)
  const visible = $derived(Boolean(request && (!request.sessionId || !sessionId || request.sessionId === sessionId)))
  const approvalCardClass = `${cardClass} overflow-hidden border-dashed border-warning/35 !bg-warning/5 text-xs`
  const description = $derived(request?.description || 'Hermes wants to run a guarded command.')

  function isSubmitting(choice: ApprovalChoice): boolean {
    return promptsState.submitting === `approval:${choice}`
  }

  function respond(choice: ApprovalChoice): void {
    if (promptsState.submitting) return
    void respondToApproval(choice)
  }
</script>

{#if visible && request}
  <div class="mx-auto w-full max-w-4xl px-4 py-3" data-role="approval">
    <section class={approvalCardClass} aria-label="Approval request">
      <div class="grid gap-3">
        <div class="min-w-0 px-3 pt-2">
          <div class="flex min-w-0 items-baseline gap-1.5">
            <svg class="h-3.5 w-3.5 shrink-0 text-warning" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3Z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="m9.5 12 1.7 1.7 3.3-4" />
            </svg>
            <span class="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-warning">Approval required</span>
            <span class="truncate text-ink-muted">· {description}</span>
          </div>

          {#if request.command.trim()}
            <TerminalBlock class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap border-warning/30 px-3 py-2 text-xs leading-5 text-ink">{request.command.trim()}</TerminalBlock>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2 px-3 pb-3">
          <Button chrome="ghost" variant="success" disabled={Boolean(promptsState.submitting)} onclick={() => respond('once')}>{isSubmitting('once') ? 'Sending' : 'Run once'}</Button>
          <Button chrome="ghost" variant="primary" disabled={Boolean(promptsState.submitting)} onclick={() => respond('session')}>{isSubmitting('session') ? 'Sending' : 'Allow session'}</Button>
          <Button chrome="ghost" variant="secondary" disabled={Boolean(promptsState.submitting)} onclick={() => respond('always')}>{isSubmitting('always') ? 'Sending' : 'Always allow'}</Button>
          <Button chrome="ghost" variant="danger" disabled={Boolean(promptsState.submitting)} onclick={() => respond('deny')}>{isSubmitting('deny') ? 'Sending' : 'Deny'}</Button>
        </div>
      </div>

      {#if promptsState.error}
        <p class="mt-2 text-xs text-danger">{promptsState.error}</p>
      {/if}
    </section>
  </div>
{/if}
