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
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 backdrop-blur-sm" role="presentation">
    <div class="cli-panel w-full max-w-md border-primary/45 p-5" role="dialog" aria-modal="true" aria-labelledby="secret-title">
      <div class="cli-panel-header text-primary">Secret_Request</div>
      <p class="cli-section-title text-primary">Credential required</p>
      <h2 id="secret-title" class="mt-2 text-lg font-semibold tracking-[0.08em] text-ink-bright">{request.envVar || 'Credential'} required</h2>
      <p class="mt-2 text-sm leading-6 text-ink-muted">{request.prompt || 'Hermes is blocked waiting for a secret value.'}</p>
      <form class="mt-4 grid gap-3" onsubmit={event => { event.preventDefault(); void submit() }}>
        <input
          class="cli-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          bind:value={value}
          disabled={submitting}
          placeholder={request.envVar || 'Secret value'}
          type="password"
          autocomplete="off"
        />
        {#if promptsState.error}
          <p class="text-xs text-danger">{promptsState.error}</p>
        {/if}
        <div class="flex justify-end gap-2">
          <button class="bitch-button bitch-button-primary" disabled={submitting || !value} type="submit">{submitting ? 'Sending…' : 'Submit secret'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}
