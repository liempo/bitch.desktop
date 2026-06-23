<script lang="ts">
  import { onMount } from 'svelte'

  import GlyphCanvas from '@/app/components/GlyphCanvas.svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import MainGlyphEditDialog from './MainGlyphEditDialog.svelte'
  import type { MonitoringMetrics } from '$lib/monitoring'

  interface Props {
    class?: string
    hostname: string
    metrics: MonitoringMetrics
    titleClass?: string
  }

  let { class: className = '', hostname, metrics, titleClass = '' }: Props = $props()

  let themeElement = $state<HTMLDivElement>()
  let editOpen = $state(false)
  let foregroundColor = $state('white')
  let mutedColor = $state('gray')
  let lineColor = $state('white')

  onMount(() => {
    const styles = getComputedStyle(themeElement ?? document.documentElement)
    foregroundColor = styles.getPropertyValue('--color-ink-bright').trim() || foregroundColor
    mutedColor = styles.getPropertyValue('--color-ink-muted').trim() || mutedColor
    lineColor = styles.getPropertyValue('--color-line-strong').trim() || lineColor
  })
</script>

<div bind:this={themeElement} class="h-full min-h-0">
  <Panel title="GLYPH" padded={false} class={className} contentClass="relative h-full min-h-0 overflow-hidden p-0" {titleClass}>
    {#snippet actions()}
      <Button
        variant="unstyled"
        class="flex h-5 w-5 items-center justify-center p-0 text-ink-muted hover:text-ink-bright"
        onclick={() => (editOpen = true)}
        aria-label="Edit glyph"
        title="Edit glyph"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L7.5 19.152 3.75 20.25l1.098-3.75z" />
        </svg>
      </Button>
    {/snippet}
    <div class="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] truncate text-[0.68rem] uppercase tracking-[0.16em] text-ink-muted" title={hostname}>
      // {hostname || 'UNKNOWN'}
    </div>
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-size-[24px_24px] opacity-15"
    ></div>
    <GlyphCanvas
      class="h-full w-full overflow-hidden"
      cpuUsagePercent={metrics.cpu.usagePercent}
      memoryUsagePercent={metrics.memory.usedPercent}
      {foregroundColor}
      {mutedColor}
      {lineColor}
    />
  </Panel>
  <MainGlyphEditDialog bind:open={editOpen} />
</div>
