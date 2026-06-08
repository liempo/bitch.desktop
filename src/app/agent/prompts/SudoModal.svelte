<script lang="ts">
  import CredentialModal from './CredentialModal.svelte'
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
  <CredentialModal
    bind:value={password}
    autocomplete="current-password"
    disabled={!password}
    description="Hermes is blocked waiting for a sudo password. It will be sent to the active gateway request only."
    error={promptsState.error}
    heading="Sudo password required"
    id="sudo-title"
    onSubmit={submit}
    placeholder="password"
    submitLabel="Submit password"
    {submitting}
    title="Privileged_Command"
    tone="danger"
  />
{/if}
