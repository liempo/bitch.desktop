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
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 backdrop-blur-sm" role="presentation">
    <div class="cli-panel w-full max-w-md border-danger/45 p-5" role="dialog" aria-modal="true" aria-labelledby="sudo-title">
      <div class="cli-panel-header text-danger">Privileged_Command</div>
      <p class="cli-section-title text-danger">Credential required</p>
      <h2 id="sudo-title" class="mt-2 text-lg font-semibold tracking-[0.08em] text-ink-bright">Sudo password required</h2>
      <p class="mt-2 text-sm leading-6 text-ink-muted">Hermes is blocked waiting for a sudo password. It will be sent to the active gateway request only.</p>
      <form class="mt-4 grid gap-3" onsubmit={event => { event.preventDefault(); void submit() }}>
        <input
          class="cli-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          bind:value={password}
          disabled={submitting}
          placeholder="password"
          type="password"
          autocomplete="current-password"
        />
        {#if promptsState.error}
          <p class="text-xs text-danger">{promptsState.error}</p>
        {/if}
        <div class="flex justify-end gap-2">
          <button class="bitch-button bitch-button-danger" disabled={submitting || !password} type="submit">{submitting ? 'Sending…' : 'Submit password'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
