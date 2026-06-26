<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Icon from '@/app/components/ui/Icon.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import TerminalBlock from '@/app/components/ui/TerminalBlock.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import { type ApprovalChoice, promptsState, respondToApproval } from '$lib/hermes/prompts'

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
            <Icon name="shieldCheck" class="h-3.5 w-3.5 text-warning" />
            <span class="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-warning">Approval required</span>
            <span class="truncate text-ink-muted">· {description}</span>
          </div>

          {#if request.command.trim()}
            <TerminalBlock class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap border-warning/30 px-3 py-2 text-xs leading-5 text-ink">{request.command.trim()}</TerminalBlock>
          {/if}
        </div>

        <div class="flex flex-wrap items-center gap-2 px-3 pb-3">
          <Button chrome="ghost" variant="success" disabled={Boolean(promptsState.submitting)} onclick={() => respond('once')} aria-label={isSubmitting('once') ? 'Sending approval response' : 'Run once'}>
            {#if isSubmitting('once')}
              <Loader size="sm" label="Sending approval response" />
            {:else}
              Run once
            {/if}
          </Button>
          <Button chrome="ghost" variant="primary" disabled={Boolean(promptsState.submitting)} onclick={() => respond('session')} aria-label={isSubmitting('session') ? 'Sending approval response' : 'Allow session'}>
            {#if isSubmitting('session')}
              <Loader size="sm" label="Sending approval response" />
            {:else}
              Allow session
            {/if}
          </Button>
          <Button chrome="ghost" variant="secondary" disabled={Boolean(promptsState.submitting)} onclick={() => respond('always')} aria-label={isSubmitting('always') ? 'Sending approval response' : 'Always allow'}>
            {#if isSubmitting('always')}
              <Loader size="sm" label="Sending approval response" />
            {:else}
              Always allow
            {/if}
          </Button>
          <Button chrome="ghost" variant="danger" disabled={Boolean(promptsState.submitting)} onclick={() => respond('deny')} aria-label={isSubmitting('deny') ? 'Sending approval response' : 'Deny'}>
            {#if isSubmitting('deny')}
              <Loader size="sm" label="Sending approval response" />
            {:else}
              Deny
            {/if}
          </Button>
        </div>
      </div>

      {#if promptsState.error}
        <p class="mt-2 text-xs text-danger">{promptsState.error}</p>
      {/if}
    </section>
  </div>
{/if}
