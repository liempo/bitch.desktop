<script lang="ts">
  import Icon from '@/app/components/ui/Icon.svelte'
  import { readRemoteFileDataUrl } from '$lib/hermes/files'
  import type { ConversationAttachment, ConversationAttachmentKind } from '$lib/hermes/conversations'
  import type { NerdIconName } from '$lib/theme'

  interface Props {
    attachments?: ConversationAttachment[]
    profile?: null | string
  }

  let { attachments = [], profile = null }: Props = $props()

  let resolvedSources = $state<Record<string, string>>({})
  let failedSources = $state<Record<string, string>>({})
  let activeAttachment = $state<ConversationAttachment | null>(null)

  function keyFor(attachment: ConversationAttachment, activeProfile: null | string): string {
    return `${attachment.id}:${activeProfile ?? 'default'}:${attachment.path ?? ''}`
  }

  function imageSource(attachment: ConversationAttachment): string {
    if (attachment.previewUrl) return attachment.previewUrl
    if (attachment.dataUrl) return attachment.dataUrl
    if (attachment.url) return attachment.url
    if (attachment.path) return resolvedSources[keyFor(attachment, profile)] ?? ''

    return ''
  }

  function attachmentHref(attachment: ConversationAttachment): string {
    if (attachment.dataUrl) return attachment.dataUrl
    if (attachment.url) return attachment.url
    if (attachment.path) return resolvedSources[keyFor(attachment, profile)] ?? ''

    return ''
  }

  function attachmentSource(attachment: ConversationAttachment): string {
    return attachment.kind === 'image' ? imageSource(attachment) : attachmentHref(attachment)
  }

  function detailFor(attachment: ConversationAttachment): string {
    if (attachment.detail) return attachment.detail
    if (attachment.mediaType) return attachment.mediaType

    switch (attachment.kind) {
      case 'audio':
        return 'audio'
      case 'file':
        return 'file'
      case 'pdf':
        return 'PDF'
      case 'video':
        return 'video'
      default:
        return 'image'
    }
  }

  function iconFor(kind: ConversationAttachmentKind): NerdIconName {
    switch (kind) {
      case 'audio':
        return 'fileAudio'
      case 'file':
        return 'file'
      case 'pdf':
        return 'filePdf'
      case 'video':
        return 'fileVideo'
      default:
        return 'fileImage'
    }
  }

  function loadingLabel(kind: ConversationAttachmentKind): string {
    return kind === 'image' ? 'Loading image preview…' : `Loading ${detailFor({ id: '', kind, label: '' }).toLowerCase()} preview…`
  }

  function unavailableLabel(kind: ConversationAttachmentKind): string {
    switch (kind) {
      case 'audio':
        return 'Audio preview unavailable'
      case 'file':
        return 'File preview unavailable'
      case 'pdf':
        return 'PDF preview unavailable'
      case 'video':
        return 'Video preview unavailable'
      default:
        return 'Image preview unavailable'
    }
  }

  function downloadName(attachment: ConversationAttachment): string {
    const fallback = attachment.path?.split('/').filter(Boolean).pop() ?? 'attachment'
    return (attachment.label || fallback).replace(/[\\/]/g, '-')
  }

  function openAttachment(attachment: ConversationAttachment): void {
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

  async function hydratePath(attachment: ConversationAttachment, activeProfile: null | string): Promise<void> {
    if (!attachment.path) return

    const key = keyFor(attachment, activeProfile)
    if (resolvedSources[key] || failedSources[key]) return

    try {
      resolvedSources[key] = await readRemoteFileDataUrl(attachment.path, activeProfile)
    } catch (error) {
      failedSources[key] = error instanceof Error ? error.message : 'Could not load remote attachment preview'
    }
  }

  $effect(() => {
    for (const attachment of attachments) {
      if (attachment.path && !attachment.previewUrl && !attachment.dataUrl && !attachment.url) {
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
              {failedSources[key] ? unavailableLabel(attachment.kind) : loadingLabel(attachment.kind)}
            </span>
          {/if}
          <span class="block border-t border-line/70 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-ink-muted">
            {attachment.label}
          </span>
        </button>
      {:else if attachment.kind === 'audio'}
        {@const href = attachmentHref(attachment)}
        {@const key = keyFor(attachment, profile)}
        <div class="grid max-w-xl gap-2 border border-line bg-surface/70 px-3 py-2 text-xs text-ink">
          <div class="flex items-center gap-2">
            <Icon name={iconFor(attachment.kind)} label={detailFor(attachment)} decorative={false} class="text-success" />
            <span class="min-w-0 flex-1 truncate text-ink-bright">{attachment.label}</span>
            <span class="shrink-0 text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">{detailFor(attachment)}</span>
          </div>
          {#if href}
            <audio controls preload="metadata" src={href} class="w-full"></audio>
          {:else}
            <span class="text-[0.72rem] uppercase tracking-[0.16em] text-ink-muted">
              {failedSources[key] ? unavailableLabel(attachment.kind) : loadingLabel(attachment.kind)}
            </span>
          {/if}
        </div>
      {:else if attachment.kind === 'video'}
        {@const href = attachmentHref(attachment)}
        {@const key = keyFor(attachment, profile)}
        <div class="grid max-w-xl gap-2 border border-line bg-surface/70 p-2 text-xs text-ink">
          {#if href}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video controls preload="metadata" src={href} class="max-h-80 max-w-full rounded-control bg-black/30"></video>
          {:else}
            <span class="px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-ink-muted">
              {failedSources[key] ? unavailableLabel(attachment.kind) : loadingLabel(attachment.kind)}
            </span>
          {/if}
          <div class="flex items-center gap-2">
            <Icon name={iconFor(attachment.kind)} label={detailFor(attachment)} decorative={false} class="text-primary" />
            <span class="min-w-0 flex-1 truncate text-ink-bright">{attachment.label}</span>
            <span class="shrink-0 text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted">{detailFor(attachment)}</span>
          </div>
        </div>
      {:else if attachment.kind === 'pdf' || attachment.kind === 'file'}
        {@const href = attachmentHref(attachment)}
        <button
          type="button"
          class="flex cursor-pointer items-center gap-2 border border-line bg-surface/70 px-3 py-2 text-left text-xs text-ink transition hover:border-primary/55 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default disabled:hover:border-line disabled:hover:bg-surface/70"
          aria-label={`Open attachment ${attachment.label}`}
          disabled={!href}
          onclick={() => openAttachment(attachment)}
        >
          <Icon name={iconFor(attachment.kind)} label={detailFor(attachment)} decorative={false} class="text-warning" />
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
            <Icon name="download" class="text-base" />
          </a>
        {/if}
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface-raised font-hud text-sm font-bold text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
          aria-label="Close attachment viewer"
          onclick={closeAttachmentViewer}
        >
          <Icon name="close" class="text-sm" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden bg-black/20 p-3">
        {#if activeAttachment.kind === 'image' && activeSource}
          <div class="flex h-full items-center justify-center overflow-auto">
            <img src={activeSource} alt={activeAttachment.label || 'Attached image'} class="max-h-full max-w-full object-contain" />
          </div>
        {:else if activeAttachment.kind === 'audio' && activeSource}
          <div class="flex h-full items-center justify-center rounded-panel border border-line bg-surface/70 p-6">
            <audio controls preload="metadata" src={activeSource} class="w-full max-w-3xl"></audio>
          </div>
        {:else if activeAttachment.kind === 'video' && activeSource}
          <div class="flex h-full items-center justify-center overflow-auto">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video controls preload="metadata" src={activeSource} class="max-h-full max-w-full rounded-control"></video>
          </div>
        {:else if activeAttachment.kind === 'pdf' && activeSource}
          <iframe title={activeAttachment.label} src={activeSource} class="h-full w-full rounded-control border border-line bg-white"></iframe>
        {:else if activeAttachment.kind === 'file' && activeSource}
          <div class="flex h-full items-center justify-center rounded-panel border border-line bg-surface/70 p-6 text-center text-sm text-ink-muted">
            <div>
              <p class="font-semibold uppercase tracking-[0.12em] text-ink-bright">File preview unavailable</p>
              <a class="mt-3 inline-flex text-primary underline decoration-primary/50 underline-offset-4" href={activeSource} download={downloadName(activeAttachment)}>
                Download {activeAttachment.label}
              </a>
            </div>
          </div>
        {:else}
          <div class="flex h-full items-center justify-center rounded-panel border border-line bg-surface/70 p-6 text-center text-sm text-ink-muted">
            Attachment preview unavailable.
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
