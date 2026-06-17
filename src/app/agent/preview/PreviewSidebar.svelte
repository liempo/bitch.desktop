<script lang="ts">
  import Panel from '@/components/ui/Panel.svelte'
  import { panelWidthStyle, PREVIEW_PANEL_WIDTH } from '$lib/layout/panel-resize'
  import type { ThreadPreview } from '$lib/preview'

  interface Props {
    onClose?: () => void
    preview: ThreadPreview
    width?: number
  }

  let { onClose, preview, width = PREVIEW_PANEL_WIDTH.defaultWidth }: Props = $props()

  const detail = $derived(preview.url ?? preview.error ?? preview.source)
  const previewStyle = $derived(panelWidthStyle('--agent-preview-width', width))
  const title = $derived(preview.kind === 'canvas' ? 'Canvas' : 'Preview')
  const openLabel = $derived(preview.kind === 'canvas' ? 'Open canvas' : 'Open file')
</script>

<aside
  class="min-h-0 w-full shrink-0 bg-canvas/70 py-3 pr-3 md:w-[var(--agent-preview-width)]"
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

      {#if preview.url}
        <a
          class="shrink-0 rounded-control border border-line px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-primary hover:border-primary/60 hover:bg-primary/10 hover:text-ink-bright"
          href={preview.url}
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

    {#if preview.kind === 'canvas' && preview.url}
      <iframe
        class="min-h-0 flex-1 rounded-control border border-line bg-white"
        src={preview.url}
        title={preview.label}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        referrerpolicy="no-referrer"
      ></iframe>
    {:else if preview.kind === 'image' && preview.url}
      <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-control border border-line bg-black/20 p-3">
        <img src={preview.url} alt={preview.label} class="max-h-full max-w-full object-contain" />
      </div>
    {:else}
      <div class="flex min-h-0 flex-1 items-center justify-center rounded-control border border-dashed border-warning/40 bg-warning/5 p-6 text-center text-sm leading-6 text-warning" role="status">
        <div>
          <p class="font-semibold uppercase tracking-[0.12em]">Preview unavailable</p>
          <p class="mt-2 text-warning/80">{preview.error ?? 'This BOX file can be opened directly, but no inline preview is available.'}</p>
        </div>
      </div>
    {/if}
  </Panel>
</aside>
