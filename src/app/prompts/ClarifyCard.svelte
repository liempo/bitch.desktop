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
  <div class="mx-auto w-full max-w-3xl px-4 py-3">
    <section class="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 shadow-lg shadow-black/20" aria-label="Clarify request">
      <div class="flex items-start gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-sm font-bold text-amber-100">?</div>
        <div class="min-w-0 flex-1">
          <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-200/70">Hermes needs clarification</p>
          <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-50">{request.question}</p>

          {#if choices.length > 0 && !typing}
            <div class="mt-3 grid gap-2" role="group" aria-label="Clarify choices">
              {#each choices as choice}
                <button
                  class="rounded-xl border border-amber-300/20 bg-slate-950/40 px-3 py-2 text-left text-sm text-slate-100 transition hover:border-amber-300/50 hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={submitting}
                  type="button"
                  onclick={() => void respond(choice)}
                >
                  <span class="mr-2 text-amber-200">{selectedChoice === choice ? '●' : '○'}</span>{choice}
                </button>
              {/each}
              <button
                class="rounded-xl px-3 py-2 text-left text-sm text-amber-100/80 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
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
                class="min-h-20 resize-y rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-300/60 focus:outline-none focus:ring-2 focus:ring-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                bind:value={draft}
                disabled={submitting}
                onkeydown={handleKeydown}
                placeholder="Type your answer…"
              ></textarea>
              <div class="flex items-center justify-between gap-2">
                <span class="text-[0.68rem] text-slate-500">⌘/Ctrl + Enter to send</span>
                <div class="flex items-center gap-2">
                  {#if choices.length > 0}
                    <button class="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-100" disabled={submitting} type="button" onclick={() => { typing = false; draft = '' }}>Back</button>
                  {/if}
                  <button class="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50" disabled={submitting} type="button" onclick={submitSkip}>Skip</button>
                  <button class="rounded-lg bg-amber-300/15 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !draft.trim()} type="submit">{submitting ? 'Sending…' : 'Send'}</button>
                </div>
              </div>
            </form>
          {/if}

          {#if promptsState.error}
            <p class="mt-2 text-xs text-red-300">{promptsState.error}</p>
          {/if}
        </div>
      </div>
    </section>
  </div>
{/if}
