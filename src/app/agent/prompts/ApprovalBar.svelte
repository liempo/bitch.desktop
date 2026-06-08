<script lang="ts">
  import Button from '@/components/ui/Button.svelte'
  import SectionTitle from '@/components/ui/SectionTitle.svelte'
  import TerminalBlock from '@/components/ui/TerminalBlock.svelte'
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
        <SectionTitle tone="warning">Approval required</SectionTitle>
        <p class="mt-1 text-sm font-medium text-ink-bright">{request.description || 'Hermes wants to run a guarded command.'}</p>
        {#if request.command.trim()}
          <TerminalBlock class="mt-2 max-h-24 overflow-auto whitespace-pre-wrap border-warning/30 px-3 py-2 text-xs leading-5 text-ink">{request.command.trim()}</TerminalBlock>
        {/if}
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="success" disabled={Boolean(promptsState.submitting)} onclick={() => respond('once')}>{isSubmitting('once') ? 'Sending…' : 'Run once'}</Button>
        <Button variant="primary" disabled={Boolean(promptsState.submitting)} onclick={() => respond('session')}>{isSubmitting('session') ? 'Sending…' : 'Allow session'}</Button>
        <Button variant="secondary" disabled={Boolean(promptsState.submitting)} onclick={() => respond('always')}>{isSubmitting('always') ? 'Sending…' : 'Always allow'}</Button>
        <Button variant="danger" disabled={Boolean(promptsState.submitting)} onclick={() => respond('deny')}>{isSubmitting('deny') ? 'Sending…' : 'Deny'}</Button>
      </div>
    </div>
    {#if promptsState.error}
      <p class="mx-auto mt-2 max-w-5xl text-xs text-danger">{promptsState.error}</p>
    {/if}
  </section>
{/if}
