<script lang="ts">
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import SectionTitle from '@/components/ui/SectionTitle.svelte'
  import TextArea from '@/components/ui/TextArea.svelte'
  import { cardClass } from '@/components/ui/styles'
  import { clarifyRequestForSession, promptsState, respondToClarify } from '$lib/stores/prompts.svelte'

  interface Props {
    sessionId: string
  }

  let { sessionId }: Props = $props()

  let draft = $state('')
  let typing = $state(false)
  let selectedChoice: string | null = $state(null)

  const request = $derived(clarifyRequestForSession(sessionId))
  const choices = $derived(request?.choices ?? [])
  const submitting = $derived(request ? promptsState.submitting === `clarify:${request.requestId}` : false)
  const choiceClass = `${cardClass} px-3 py-2 text-left text-sm text-ink hover:border-warning/50 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50`

  async function respond(answer: string): Promise<void> {
    if (!request || submitting) return

    selectedChoice = answer || null
    const ok = await respondToClarify(sessionId, answer)

    if (ok) {
      draft = ''
      typing = false
      selectedChoice = null
    }
  }

  function submitFreeform(): void {
    const answer = draft.trim()
    if (answer) {
      void respond(answer)
    }
  }

  function submitSkip(): void {
    void respond('')
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submitFreeform()
    }
  }
</script>

{#if request}
  <div class="mx-auto w-full max-w-4xl px-4 py-3">
    <Panel title="Clarify_Request" titleClass="text-warning" class="border-warning/35 !bg-warning/5" contentClass="p-4" padded={false} fullHeight={false} aria-label="Clarify request">
      <div class="flex items-start gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-warning/40 bg-warning/10 text-sm font-bold text-warning">?</div>
        <div class="min-w-0 flex-1">
          <SectionTitle tone="warning">Hermes needs clarification</SectionTitle>
          <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-bright">{request.question}</p>

          {#if choices.length > 0 && !typing}
            <div class="mt-3 grid gap-2" role="group" aria-label="Clarify choices">
              {#each choices as choice}
                <button
                  class={choiceClass}
                  disabled={submitting}
                  type="button"
                  onclick={() => void respond(choice)}
                >
                  <span class="mr-2 text-warning">{selectedChoice === choice ? '>' : '-'}</span>{choice}
                </button>
              {/each}
              <Button
                variant="warning"
                class="justify-start disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting}
                onclick={() => (typing = true)}
              >
                Other answer…
              </Button>
            </div>
          {/if}

          {#if choices.length === 0 || typing}
            <form class="mt-3 grid gap-2" onsubmit={event => { event.preventDefault(); submitFreeform() }}>
              <TextArea
                class="min-h-20 resize-y px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                bind:value={draft}
                disabled={submitting}
                onkeydown={handleKeydown}
                placeholder="type answer..."
              ></TextArea>
              <div class="flex items-center justify-between gap-2">
                <span class="text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">⌘/Ctrl + Enter to send</span>
                <div class="flex items-center gap-2">
                  {#if choices.length > 0}
                    <Button disabled={submitting} onclick={() => { typing = false; draft = '' }}>Back</Button>
                  {/if}
                  <Button disabled={submitting} onclick={submitSkip}>Skip</Button>
                  <Button variant="warning" disabled={submitting || !draft.trim()} type="submit">{submitting ? 'Sending…' : 'Send'}</Button>
                </div>
              </div>
            </form>
          {/if}

          {#if promptsState.error}
            <p class="mt-2 text-xs text-danger">{promptsState.error}</p>
          {/if}
        </div>
      </div>
    </Panel>
  </div>
{/if}
