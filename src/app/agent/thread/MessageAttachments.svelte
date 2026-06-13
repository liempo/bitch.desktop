<script lang="ts">
  import { boxUrlForAgentPath } from '$lib/box'
  import { gatewayMediaDataUrl } from '$lib/media'
  import type { ThreadAttachment } from '$lib/stores/messages.svelte'

  interface Props {
    attachments?: ThreadAttachment[]
    profile?: null | string
  }

  let { attachments = [], profile = null }: Props = $props()

  let resolvedSources = $state<Record<string, string>>({})
  let failedSources = $state<Record<string, string>>({})
  let activeAttachment = $state<ThreadAttachment | null>(null)

  function keyFor(attachment: ThreadAttachment, activeProfile: null | string): string {
    return `${attachment.id}:${activeProfile ?? 'default'}:${attachment.path ?? ''}`
  }

  function imageSource(attachment: ThreadAttachment): string {
    if (attachment.previewUrl) return attachment.previewUrl
    if (attachment.dataUrl) return attachment.dataUrl
    if (attachment.url) return attachment.url
    if (attachment.path) return boxUrlForAgentPath(attachment.path) ?? (resolvedSources[keyFor(attachment, profile)] ?? '')

    return ''
  }

  function attachmentHref(attachment: ThreadAttachment): string {
    if (attachment.url) return attachment.url
    if (attachment.path) return boxUrlForAgentPath(attachment.path) ?? ''

    return ''
  }

  function attachmentSource(attachment: ThreadAttachment): string {
    return attachment.kind === 'image' ? imageSource(attachment) : attachmentHref(attachment)
  }

  function detailFor(attachment: ThreadAttachment): string {
    if (attachment.detail) return attachment.detail
    if (attachment.mediaType) return attachment.mediaType
    return attachment.kind === 'pdf' ? 'PDF' : 'image'
  }

  function downloadName(attachment: ThreadAttachment): string {
    const fallback = attachment.path?.split('/').filter(Boolean).pop() ?? 'attachment'
    return (attachment.label || fallback).replace(/[\\/]/g, '-')
  }

  function openAttachment(attachment: ThreadAttachment): void {
    if (!attachmentSource(attachment)) return
    activeAttachment = attachment
  }

  function closeAttachmentViewer(): void {
    activeAttachment = null
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) closeAttachmentViewer()
  }

  function handleViewerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeAttachmentViewer()
  }

  async function hydratePath(attachment: ThreadAttachment, activeProfile: null | string): Promise<void> {
    if (!attachment.path || attachment.kind !== 'image') return
    if (boxUrlForAgentPath(attachment.path)) return

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

<svelte:window onkeydown={handleViewerKeydown} />

{#if attachments.length > 0}
  <div class="mt-2 grid max-w-full gap-2" aria-label="Message attachments">
    {#each attachments as attachment (attachment.id)}
      {#if attachment.kind === 'image'}
        {@const src = imageSource(attachment)}
        {@const key = keyFor(attachment, profile)}
        <button
          type="button"
          class="max-w-full cursor-pointer overflow-hidden border border-line bg-surface/70 p-0 text-left transition hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default disabled:hover:border-line disabled:hover:bg-surface/70"
          aria-label={`Open attachment ${attachment.label || 'image'}`}
          disabled={!src}
          onclick={() => openAttachment(attachment)}
        >
          {#if src}
            <img
              class="block max-h-72 w-auto max-w-full object-contain"
              src={src}
              alt={attachment.label || 'Attached image'}
              loading="lazy"
            />
          {:else}
            <span class="block px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-ink-muted">
              {failedSources[key] ? 'Image preview unavailable' : 'Loading image preview…'}
            </span>
          {/if}
          <span class="block border-t border-line/70 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-ink-muted">
            {attachment.label}
          </span>
        </button>
      {:else}
        {@const href = attachmentHref(attachment)}
        <button
          type="button"
          class="flex cursor-pointer items-center gap-2 border border-line bg-surface/70 px-3 py-2 text-left text-xs text-ink transition hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default disabled:hover:border-line disabled:hover:bg-surface/70"
          aria-label={`Open attachment ${attachment.label}`}
          disabled={!href}
          onclick={() => openAttachment(attachment)}
        >
          <span class="font-hud text-[0.66rem] uppercase tracking-[0.18em] text-warning">PDF</span>
          <span class="min-w-0 flex-1 truncate text-ink-bright">{attachment.label}</span>
          <span class="shrink-0 text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">{detailFor(attachment)}</span>
        </button>
      {/if}
    {/each}
  </div>
{/if}

{#if activeAttachment}
  {@const activeSource = attachmentSource(activeAttachment)}
  <div
    class="fixed inset-0 z-50 flex bg-canvas/95 text-ink shadow-[0_0_0_1px_var(--color-line)] backdrop-blur"
    role="dialog"
    aria-modal="true"
    aria-label={`Attachment viewer: ${activeAttachment.label}`}
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleViewerKeydown}
  >
    <div class="flex min-h-0 w-full flex-col">
      <header class="flex min-h-12 items-center gap-2 border-b border-line bg-surface/90 px-3">
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-ink-bright">{activeAttachment.label}</h2>
          <p class="truncate font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">{detailFor(activeAttachment)}</p>
        </div>
        {#if activeSource}
          <a
            class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-primary/50 bg-surface-raised font-hud text-base font-bold text-primary hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
            href={activeSource}
            download={downloadName(activeAttachment)}
            aria-label="Download attachment"
            title="Download attachment"
          >
            ⇩
          </a>
        {/if}
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface-raised font-hud text-sm font-bold text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
          aria-label="Close attachment viewer"
          onclick={closeAttachmentViewer}
        >
          ×
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden bg-black/20 p-3">
        {#if activeAttachment.kind === 'image' && activeSource}
          <div class="flex h-full items-center justify-center overflow-auto">
            <img src={activeSource} alt={activeAttachment.label || 'Attached image'} class="max-h-full max-w-full object-contain" />
          </div>
        {:else if activeAttachment.kind === 'pdf' && activeSource}
          <iframe title={activeAttachment.label} src={activeSource} class="h-full w-full rounded-control border border-line bg-white"></iframe>
        {:else}
          <div class="flex h-full items-center justify-center rounded-panel border border-line bg-surface/70 p-6 text-center text-sm text-ink-muted">
            Attachment preview unavailable.
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
