<script lang="ts">
  import Panel from '@/app/components/ui/Panel.svelte'
  import { panelWidthStyle, PREVIEW_PANEL_WIDTH } from '$lib/layout/panel-resize'
  import type { ThreadPreview } from '$lib/preview'
  import { readRemoteFileDataUrl, readRemoteFileText, viewerKindForRemoteFile, type RemoteFileViewerKind } from '$lib/remote-files'

  interface Props {
    onClose?: () => void
    preview: ThreadPreview
    profile?: null | string
    width?: number
  }

  let { onClose, preview, profile = null, width = PREVIEW_PANEL_WIDTH.defaultWidth }: Props = $props()

  let loading = $state(false)
  let remoteUrl = $state<null | string>(null)
  let textPreview = $state('')
  let loadError = $state('')
  let loadSequence = 0

  const detail = $derived(preview.path ?? preview.url ?? preview.error ?? preview.source)
  const previewStyle = $derived(panelWidthStyle('--agent-preview-width', width))
  const title = $derived(preview.kind === 'canvas' ? 'Canvas' : 'Preview')
  const activeUrl = $derived(preview.url ?? remoteUrl)
  const activeViewerKind = $derived(viewerKindForPreview(preview))
  const openLabel = $derived(preview.kind === 'canvas' ? 'Open canvas' : 'Open file')
  const visibleError = $derived(preview.error ?? loadError)

  $effect(() => {
    const activePreview = preview
    const activeProfile = activePreview.profile ?? profile
    void loadPreview(activePreview, activeProfile)
  })

  function resetLoadedState(): void {
    loading = false
    remoteUrl = null
    textPreview = ''
    loadError = ''
  }

  function viewerKindForPreview(activePreview: ThreadPreview): RemoteFileViewerKind {
    if (activePreview.viewerKind && activePreview.viewerKind !== 'download') return activePreview.viewerKind
    if (activePreview.path) return viewerKindForRemoteFile(activePreview.path)
    return activePreview.kind === 'image' ? 'image' : 'text'
  }

  async function loadPreview(activePreview: ThreadPreview, activeProfile: null | string): Promise<void> {
    const sequence = (loadSequence += 1)
    resetLoadedState()

    if (activePreview.error || !activePreview.path) return
    if (activePreview.kind === 'canvas' && activePreview.url) return

    const viewerKind = viewerKindForPreview(activePreview)

    loading = true

    try {
      if (viewerKind === 'text') {
        const result = await readRemoteFileText(activePreview.path, activeProfile)
        if (sequence !== loadSequence) return
        textPreview = result.text
      } else {
        const dataUrl = await readRemoteFileDataUrl(activePreview.path, activeProfile)
        if (sequence !== loadSequence) return
        remoteUrl = dataUrl
      }
    } catch (error) {
      if (sequence === loadSequence) loadError = error instanceof Error ? error.message : String(error)
    } finally {
      if (sequence === loadSequence) loading = false
    }
  }
</script>

<aside
  class="hidden min-h-0 w-full shrink-0 bg-canvas/70 py-3 pr-3 md:block md:w-(--agent-preview-width)"
  style={previewStyle}
  aria-label="Preview sidebar"
>
  <Panel title={title} titleClass="text-primary" padded={false} contentClass="flex min-h-0 flex-col p-3" class="h-full">
    <div class="mb-3 flex min-w-0 items-center gap-3 border-b border-line pb-3">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-sm font-semibold tracking-[0.04em] text-ink-bright" title={preview.label}>
          {preview.label}
        </h2>
        <p class="mt-1 truncate font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted" title={detail}>
          {detail}
        </p>
      </div>

      {#if activeUrl}
        <a
          class="shrink-0 rounded-control border border-line px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-primary hover:border-primary/60 hover:bg-primary/10 hover:text-ink-bright"
          href={activeUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={openLabel}
          title={openLabel}
        >
          {openLabel}
        </a>
      {/if}

      {#if onClose}
        <button
          type="button"
          class="shrink-0 rounded-control border border-line px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
          aria-label="Close preview"
          title="Close preview"
          onclick={onClose}
        >
          Close
        </button>
      {/if}
    </div>

    {#if loading}
      <div class="flex min-h-0 flex-1 items-center justify-center rounded-control border border-primary/30 bg-primary/10 font-hud text-[0.68rem] uppercase tracking-[0.18em] text-primary" role="status">
        Loading remote file preview…
      </div>
    {:else if visibleError}
      <div class="flex min-h-0 flex-1 items-center justify-center rounded-control border border-dashed border-warning/40 bg-warning/5 p-6 text-center text-sm leading-6 text-warning" role="status">
        <div>
          <p class="font-semibold uppercase tracking-[0.12em]">Preview unavailable</p>
          <p class="mt-2 text-warning/80">{visibleError}</p>
        </div>
      </div>
    {:else if preview.kind === 'canvas' && activeUrl}
      <iframe
        class="min-h-0 flex-1 rounded-control border border-line bg-white"
        src={activeUrl}
        title={preview.label}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        referrerpolicy="no-referrer"
      ></iframe>
    {:else if activeViewerKind === 'image' && activeUrl}
      <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-control border border-line bg-black/20 p-3">
        <img src={activeUrl} alt={preview.label} class="max-h-full max-w-full object-contain" />
      </div>
    {:else if activeViewerKind === 'pdf' && activeUrl}
      <iframe title={preview.label} src={activeUrl} class="min-h-0 flex-1 rounded-control border border-line bg-white"></iframe>
    {:else if activeViewerKind === 'audio' && activeUrl}
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-control border border-line bg-surface/70 p-6 text-center text-sm text-ink-muted">
        <span class="font-hud text-4xl text-success">AUD</span>
        <audio controls preload="metadata" src={activeUrl} class="w-full"></audio>
      </div>
    {:else if activeViewerKind === 'video' && activeUrl}
      <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-control border border-line bg-black/30 p-3">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video controls preload="metadata" src={activeUrl} class="max-h-full max-w-full rounded-control"></video>
      </div>
    {:else if activeViewerKind === 'html' && activeUrl}
      <iframe
        class="min-h-0 flex-1 rounded-control border border-line bg-white"
        src={activeUrl}
        title={preview.label}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        referrerpolicy="no-referrer"
      ></iframe>
    {:else if activeViewerKind === 'text'}
      <pre class="min-h-0 flex-1 overflow-auto rounded-control border border-line bg-canvas/60 p-3 text-xs leading-5 whitespace-pre-wrap text-ink-bright" data-selectable="true">{textPreview}</pre>
    {:else}
      <pre class="min-h-0 flex-1 overflow-auto rounded-control border border-line bg-canvas/60 p-3 text-xs leading-5 whitespace-pre-wrap text-ink-bright" data-selectable="true">{textPreview}</pre>
    {/if}
  </Panel>
</aside>
