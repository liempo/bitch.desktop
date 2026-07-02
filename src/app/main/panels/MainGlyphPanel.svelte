<script lang="ts">
  import { Canvas } from '@threlte/core'

  import Glyph from '@/app/components/Glyph.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import type { MonitoringMetrics } from '$lib/monitoring'
  import { themeState } from '$lib/theme'

  interface Props {
    class?: string
    hostname: string
    metrics: MonitoringMetrics
    titleClass?: string
  }

  let { class: className = '', hostname, metrics, titleClass = '' }: Props = $props()

  const foregroundColor = $derived(themeState.selectedTheme.cssVariables['--bits-ink-bright'] ?? 'white')
  const mutedColor = $derived(themeState.selectedTheme.cssVariables['--bits-ink-muted'] ?? 'gray')
  const lineColor = $derived(themeState.selectedTheme.cssVariables['--bits-line-strong'] ?? 'white')
</script>

<div class="h-full min-h-0 min-w-0">
  <Panel title="GLYPH" padded={false} class={className} contentClass="relative h-full min-h-0 overflow-hidden p-0" {titleClass}>
    <div class="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] truncate text-[0.68rem] uppercase tracking-[0.16em] text-ink-muted" title={hostname}>
      // {hostname || 'UNKNOWN'}
    </div>
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-size-[24px_24px] opacity-15"
    ></div>
    <Canvas renderMode="always" dpr={[1, 1.5]} colorManagementEnabled={false}>
      <Glyph
        cpuUsagePercent={metrics.cpu.usagePercent}
        memoryUsagePercent={metrics.memory.usedPercent}
        {foregroundColor}
        {mutedColor}
        {lineColor}
      />
    </Canvas>
  </Panel>
</div>
