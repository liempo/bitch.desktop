<script lang="ts">
  import { promptsState, respondToSudo } from '$lib/stores/prompts.svelte'

  let password = $state('')
  const request = $derived(promptsState.sudoRequest)
  const submitting = $derived(request ? promptsState.submitting === `sudo:${request.requestId}` : false)

  async function submit(): Promise<void> {
    if (!request || submitting) return

    const ok = await respondToSudo(password)
    if (ok) {
      password = ''
    }
  }
</script>

{#if request}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="presentation">
    <div class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl shadow-black/50" role="dialog" aria-modal="true" aria-labelledby="sudo-title">
      <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-red-300/70">Privileged command</p>
      <h2 id="sudo-title" class="mt-2 text-lg font-semibold text-slate-100">Sudo password required</h2>
      <p class="mt-2 text-sm leading-6 text-slate-400">Hermes is blocked waiting for a sudo password. It will be sent to the active gateway request only.</p>
      <form class="mt-4 grid gap-3" onsubmit={event => { event.preventDefault(); void submit() }}>
        <input
          class="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-300/60 focus:outline-none focus:ring-2 focus:ring-red-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          bind:value={password}
          disabled={submitting}
          placeholder="Password"
          type="password"
          autocomplete="current-password"
        />
        {#if promptsState.error}
          <p class="text-xs text-red-300">{promptsState.error}</p>
        {/if}
        <div class="flex justify-end gap-2">
          <button class="rounded-lg bg-red-300/15 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-300/25 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !password} type="submit">{submitting ? 'Sending…' : 'Submit password'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
