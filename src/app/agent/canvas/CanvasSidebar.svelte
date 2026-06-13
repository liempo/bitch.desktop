<script lang="ts">
  import Panel from '@/components/ui/Panel.svelte'
  import type { ThreadCanvas } from '$lib/canvas'

  interface Props {
    canvas: ThreadCanvas
  }

  let { canvas }: Props = $props()

  const detail = $derived(canvas.url ?? canvas.error ?? canvas.source)
</script>

<aside
  class="min-h-0 w-full shrink-0 border-t border-line bg-canvas/70 p-3 md:w-[min(42vw,38rem)] md:border-t-0 md:border-l"
  aria-label="Canvas preview"
>
  <Panel title="Canvas" titleClass="text-primary" padded={false} contentClass="flex min-h-0 flex-col p-3" class="h-full">
    <div class="mb-3 flex min-w-0 items-center gap-3 border-b border-line pb-3">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-sm font-semibold tracking-[0.04em] text-ink-bright" title={canvas.label}>
          {canvas.label}
        </h2>
        <p class="mt-1 truncate font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted" title={detail}>
          {detail}
        </p>
      </div>

      {#if canvas.url}
        <a
          class="shrink-0 rounded-control border border-line px-2 py-1 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-primary hover:border-primary/60 hover:bg-primary/10 hover:text-ink-bright"
          href={canvas.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open canvas"
          title="Open canvas"
        >
          Open canvas
        </a>
      {/if}
    </div>

    {#if canvas.url}
      <iframe
        class="min-h-0 flex-1 rounded-control border border-line bg-white"
        src={canvas.url}
        title={canvas.label}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        referrerpolicy="no-referrer"
      ></iframe>
    {:else}
      <div class="flex min-h-0 flex-1 items-center justify-center rounded-control border border-dashed border-warning/40 bg-warning/5 p-6 text-center text-sm leading-6 text-warning" role="status">
        <div>
          <p class="font-semibold uppercase tracking-[0.12em]">Canvas unavailable</p>
          <p class="mt-2 text-warning/80">{canvas.error ?? 'The agent sent a canvas source that cannot be rendered.'}</p>
        </div>
      </div>
    {/if}
  </Panel>
</aside>
