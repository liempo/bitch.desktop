<script lang="ts">
  import { promptsState, respondToSecret } from '$lib/stores/prompts.svelte'

  let value = $state('')
  const request = $derived(promptsState.secretRequest)
  const submitting = $derived(request ? promptsState.submitting === `secret:${request.requestId}` : false)

  async function submit(): Promise<void> {
    if (!request || submitting) return

    const ok = await respondToSecret(value)
    if (ok) {
      value = ''
    }
  }
</script>

{#if request}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="presentation">
    <div class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="secret-title">
      <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-sky-300/70">Secret requested</p>
      <h2 id="secret-title" class="mt-2 text-lg font-semibold text-slate-100">{request.envVar || 'Credential'} required</h2>
      <p class="mt-2 text-sm leading-6 text-slate-400">{request.prompt || 'Hermes is blocked waiting for a secret value.'}</p>
      <form class="mt-4 grid gap-3" onsubmit={event => { event.preventDefault(); void submit() }}>
        <input
          class="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          bind:value={value}
          disabled={submitting}
          placeholder={request.envVar || 'Secret value'}
          type="password"
          autocomplete="off"
        />
        {#if promptsState.error}
          <p class="text-xs text-red-300">{promptsState.error}</p>
        {/if}
        <div class="flex justify-end gap-2">
          <button class="rounded-lg bg-sky-300/15 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/25 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !value} type="submit">{submitting ? 'Sending…' : 'Submit secret'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
