<script lang="ts">
  import { onMount } from 'svelte'
  import { Canvas } from '@threlte/core'

  import Panel from '@/app/components/ui/Panel.svelte'
  import MainRenderScene from './MainRenderScene.svelte'
  import type { HostMetrics } from '$lib/monitoring'

  interface Props {
    metrics: HostMetrics
  }

  let { metrics }: Props = $props()

  let themeElement = $state<HTMLDivElement>()
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
  <Panel
    flat
    padded={false}
    class="min-h-0 border-line/70! bg-surface-raised!"
    contentClass="relative h-full min-h-0 overflow-hidden p-0"
  >
    <div class="absolute left-3 top-3 z-10 text-[0.68rem] uppercase tracking-[0.16em] text-ink-muted">
      // RENDER
    </div>
    <div
      class="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-size-[24px_24px] opacity-15"
    ></div>
    <Canvas renderMode="always" dpr={[1, 1.5]} colorManagementEnabled={false}>
      <MainRenderScene
        cpuUsagePercent={metrics.cpu.usagePercent}
        memoryUsagePercent={metrics.memory.usedPercent}
        {foregroundColor}
        {mutedColor}
        {lineColor}
      />
    </Canvas>
  </Panel>
</div>
