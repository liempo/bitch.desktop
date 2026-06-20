<script lang="ts">
  import { onMount } from 'svelte'
  import { Canvas } from '@threlte/core'

  import RenderGeoScene from './RenderGeoScene.svelte'
  import type { HostMetrics } from '$lib/host-monitor'

  interface Props {
    metrics: HostMetrics
  }

  let { metrics }: Props = $props()

  let primaryColor = $state('#8be9fd')
  let secondaryColor = $state('#bd93f9')
  let warningColor = $state('#ff79c6')

  onMount(() => {
    const styles = getComputedStyle(document.documentElement)
    primaryColor = styles.getPropertyValue('--bits-primary').trim() || primaryColor
    secondaryColor = styles.getPropertyValue('--bits-secondary').trim() || secondaryColor
    warningColor = styles.getPropertyValue('--bits-warning').trim() || warningColor
  })
</script>

<div class="relative h-full min-h-0 overflow-hidden border border-line/70 bg-surface-raised">
  <div class="absolute left-3 top-3 z-10 text-[0.68rem] uppercase tracking-[0.16em] text-ink-muted">
    // RENDER_GEO
  </div>
  <div
    class="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-[size:24px_24px] opacity-15"
  ></div>
  <Canvas renderMode="always" dpr={[1, 1.5]} colorManagementEnabled={false}>
    <RenderGeoScene
      cpuUsagePercent={metrics.cpu.usagePercent}
      memoryUsagePercent={metrics.memory.usedPercent}
      {primaryColor}
      {secondaryColor}
      {warningColor}
    />
  </Canvas>
</div>
