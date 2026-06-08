<script lang="ts">
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
    <section class="cli-panel border-warning/35 bg-warning/5 p-4" aria-label="Clarify request">
      <div class="cli-panel-header text-warning">Clarify_Request</div>
      <div class="flex items-start gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-warning/40 bg-warning/10 text-sm font-bold text-warning">?</div>
        <div class="min-w-0 flex-1">
          <p class="cli-section-title text-warning">Hermes needs clarification</p>
          <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-bright">{request.question}</p>

          {#if choices.length > 0 && !typing}
            <div class="mt-3 grid gap-2" role="group" aria-label="Clarify choices">
              {#each choices as choice}
                <button
                  class="cli-card px-3 py-2 text-left text-sm text-ink transition hover:border-warning/50 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={submitting}
                  type="button"
                  onclick={() => void respond(choice)}
                >
                  <span class="mr-2 text-warning">{selectedChoice === choice ? '>' : '-'}</span>{choice}
                </button>
              {/each}
              <button
                class="bitch-button justify-start text-warning disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting}
                type="button"
                onclick={() => (typing = true)}
              >
                Other answer…
              </button>
            </div>
          {/if}

          {#if choices.length === 0 || typing}
            <form class="mt-3 grid gap-2" onsubmit={event => { event.preventDefault(); submitFreeform() }}>
              <textarea
                class="cli-textarea min-h-20 resize-y px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                bind:value={draft}
                disabled={submitting}
                onkeydown={handleKeydown}
                placeholder="type answer..."
              ></textarea>
              <div class="flex items-center justify-between gap-2">
                <span class="text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">⌘/Ctrl + Enter to send</span>
                <div class="flex items-center gap-2">
                  {#if choices.length > 0}
                    <button class="bitch-button" disabled={submitting} type="button" onclick={() => { typing = false; draft = '' }}>Back</button>
                  {/if}
                  <button class="bitch-button" disabled={submitting} type="button" onclick={submitSkip}>Skip</button>
                  <button class="bitch-button text-warning" disabled={submitting || !draft.trim()} type="submit">{submitting ? 'Sending…' : 'Send'}</button>
                </div>
              </div>
            </form>
          {/if}

          {#if promptsState.error}
            <p class="mt-2 text-xs text-danger">{promptsState.error}</p>
          {/if}
        </div>
      </div>
    </section>
  </div>
{/if}
