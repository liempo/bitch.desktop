<script lang="ts">
  import { onMount } from 'svelte'
  import { Canvas } from '@threlte/core'

  import Glyph from './Glyph.svelte'

  interface Props {
    animated?: boolean
    class?: string
    cpuUsagePercent?: number
    foregroundColor?: string
    lineColor?: string
    memoryUsagePercent?: number
    mutedColor?: string
  }

  let {
    animated = true,
    class: className = '',
    cpuUsagePercent = 48,
    foregroundColor,
    lineColor,
    memoryUsagePercent = 64,
    mutedColor
  }: Props = $props()

  let themeElement = $state<HTMLDivElement>()
  let resolvedForegroundColor = $state('white')
  let resolvedMutedColor = $state('gray')
  let resolvedLineColor = $state('white')

  onMount(() => {
    const styles = getComputedStyle(themeElement ?? document.documentElement)
    resolvedForegroundColor = foregroundColor ?? (styles.getPropertyValue('--color-ink-bright').trim() || resolvedForegroundColor)
    resolvedMutedColor = mutedColor ?? (styles.getPropertyValue('--color-ink-muted').trim() || resolvedMutedColor)
    resolvedLineColor = lineColor ?? (styles.getPropertyValue('--color-line-strong').trim() || resolvedLineColor)
  })
</script>

<div bind:this={themeElement} class={className} aria-hidden="true">
  <Canvas renderMode={animated ? 'always' : 'on-demand'} dpr={[1, 1.5]} colorManagementEnabled={false}>
    <Glyph
      {animated}
      {cpuUsagePercent}
      {memoryUsagePercent}
      foregroundColor={resolvedForegroundColor}
      mutedColor={resolvedMutedColor}
      lineColor={resolvedLineColor}
    />
  </Canvas>
</div>
