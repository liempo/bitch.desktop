<script lang="ts">
  interface Props {
    text: string
  }

  let { text }: Props = $props()

  let copied = $state(false)
  let timeout: ReturnType<typeof setTimeout> | null = null

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      copied = true

      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => (copied = false), 1500)
    } catch {
      // Clipboard API may fail in some contexts
    }
  }
</script>

<button
  class="inline-flex items-center justify-center rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-raised/50 hover:text-ink disabled:opacity-50"
  onclick={copy}
  disabled={!text}
  aria-label={copied ? 'Copied' : 'Copy message'}
  title={copied ? 'Copied' : 'Copy'}
  type="button"
>
  {#if copied}
    <svg class="h-3.5 w-3.5 text-success" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  {:else}
    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  {/if}
</button>
