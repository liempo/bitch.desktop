<script lang="ts">
  import CredentialModal from './CredentialModal.svelte'
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
  <CredentialModal
    bind:value
    autocomplete="off"
    disabled={!value}
    description={request.prompt || 'Hermes is blocked waiting for a secret value.'}
    error={promptsState.error}
    heading={`${request.envVar || 'Credential'} required`}
    id="secret-title"
    onSubmit={submit}
    placeholder={request.envVar || 'Secret value'}
    submitLabel="Submit secret"
    {submitting}
    title="Secret_Request"
    tone="primary"
  />
{/if}
