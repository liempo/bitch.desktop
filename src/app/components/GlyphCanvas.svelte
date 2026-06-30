<script lang="ts">
  import { Canvas } from '@threlte/core'

  import Glyph from './Glyph.svelte'
  import { themeState } from '$lib/theme'

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

  const resolvedForegroundColor = $derived(foregroundColor ?? themeState.selectedTheme.cssVariables['--bits-ink-bright'] ?? 'white')
  const resolvedMutedColor = $derived(mutedColor ?? themeState.selectedTheme.cssVariables['--bits-ink-muted'] ?? 'gray')
  const resolvedLineColor = $derived(lineColor ?? themeState.selectedTheme.cssVariables['--bits-line-strong'] ?? 'white')
</script>

<div class={className} aria-hidden="true">
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
