<script lang="ts">
  import { gatewayMediaDataUrl } from '$lib/media'
  import type { ThreadAttachment } from '$lib/stores/messages.svelte'

  interface Props {
    attachments?: ThreadAttachment[]
    profile?: null | string
  }

  let { attachments = [], profile = null }: Props = $props()

  let resolvedSources = $state<Record<string, string>>({})
  let failedSources = $state<Record<string, string>>({})

  function keyFor(attachment: ThreadAttachment, activeProfile: null | string): string {
    return `${attachment.id}:${activeProfile ?? 'default'}:${attachment.path ?? ''}`
  }

  function imageSource(attachment: ThreadAttachment): string {
    if (attachment.previewUrl) return attachment.previewUrl
    if (attachment.dataUrl) return attachment.dataUrl
    if (attachment.url) return attachment.url

    return attachment.path ? (resolvedSources[keyFor(attachment, profile)] ?? '') : ''
  }

  function detailFor(attachment: ThreadAttachment): string {
    if (attachment.detail) return attachment.detail
    if (attachment.mediaType) return attachment.mediaType
    return attachment.kind === 'pdf' ? 'PDF' : 'image'
  }

  async function hydratePath(attachment: ThreadAttachment, activeProfile: null | string): Promise<void> {
    if (!attachment.path || attachment.kind !== 'image') return

    const key = keyFor(attachment, activeProfile)
    if (resolvedSources[key] || failedSources[key]) return

    try {
      resolvedSources[key] = await gatewayMediaDataUrl(attachment.path, activeProfile)
    } catch (error) {
      failedSources[key] = error instanceof Error ? error.message : 'Could not load image preview'
    }
  }

  $effect(() => {
    for (const attachment of attachments) {
      if (attachment.kind === 'image' && attachment.path && !attachment.previewUrl && !attachment.dataUrl && !attachment.url) {
        void hydratePath(attachment, profile)
      }
    }
  })
</script>

{#if attachments.length > 0}
  <div class="mt-2 grid max-w-full gap-2" aria-label="Message attachments">
    {#each attachments as attachment (attachment.id)}
      {#if attachment.kind === 'image'}
        {@const src = imageSource(attachment)}
        {@const key = keyFor(attachment, profile)}
        <figure class="overflow-hidden border border-line bg-surface/70">
          {#if src}
            <img
              class="block max-h-72 w-auto max-w-full object-contain"
              src={src}
              alt={attachment.label || 'Attached image'}
              loading="lazy"
            />
          {:else}
            <div class="px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-ink-muted">
              {failedSources[key] ? 'Image preview unavailable' : 'Loading image preview…'}
            </div>
          {/if}
          <figcaption class="border-t border-line/70 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-ink-muted">
            {attachment.label}
          </figcaption>
        </figure>
      {:else}
        <div class="flex items-center gap-2 border border-line bg-surface/70 px-3 py-2 text-xs text-ink">
          <span class="font-hud text-[0.66rem] uppercase tracking-[0.18em] text-warning">PDF</span>
          <span class="min-w-0 flex-1 truncate text-ink-bright">{attachment.label}</span>
          <span class="shrink-0 text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">{detailFor(attachment)}</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}
