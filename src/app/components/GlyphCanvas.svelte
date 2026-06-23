<script lang="ts">
  import { onMount } from 'svelte'
  import { Canvas } from '@threlte/core'

  import { glyphState, initializeGlyphState } from '$lib/hermes/glyph'
  import GeneratedGlyph from './GeneratedGlyph.svelte'
  import Glyph from './Glyph.svelte'

  interface Props {
    animated?: boolean
    class?: string
    cpuUsagePercent?: number
    foregroundColor?: string
    lineColor?: string
    memoryUsagePercent?: number
    mutedColor?: string
    primaryColor?: string
  }

  let {
    animated = true,
    class: className = '',
    cpuUsagePercent = 48,
    foregroundColor,
    lineColor,
    memoryUsagePercent = 64,
    mutedColor,
    primaryColor
  }: Props = $props()

  let themeElement = $state<HTMLDivElement>()
  let resolvedForegroundColor = $state('white')
  let resolvedMutedColor = $state('gray')
  let resolvedLineColor = $state('white')
  let resolvedPrimaryColor = $state('white')

  const activeGlyphScene = $derived(glyphState.scene)

  onMount(() => {
    initializeGlyphState()

    const styles = getComputedStyle(themeElement ?? document.documentElement)
    resolvedForegroundColor = foregroundColor ?? (styles.getPropertyValue('--color-ink-bright').trim() || resolvedForegroundColor)
    resolvedMutedColor = mutedColor ?? (styles.getPropertyValue('--color-ink-muted').trim() || resolvedMutedColor)
    resolvedLineColor = lineColor ?? (styles.getPropertyValue('--color-line-strong').trim() || resolvedLineColor)
    resolvedPrimaryColor = primaryColor ?? (styles.getPropertyValue('--color-primary').trim() || resolvedLineColor)
  })
</script>

<div bind:this={themeElement} class={className} aria-hidden="true">
  <Canvas renderMode={animated ? 'always' : 'on-demand'} dpr={[1, 1.5]} colorManagementEnabled={false}>
    {#if activeGlyphScene}
      <GeneratedGlyph
        {animated}
        {cpuUsagePercent}
        {memoryUsagePercent}
        scene={activeGlyphScene}
        foregroundColor={resolvedForegroundColor}
        mutedColor={resolvedMutedColor}
        lineColor={resolvedLineColor}
        primaryColor={resolvedPrimaryColor}
      />
    {:else}
      <Glyph
        {animated}
        {cpuUsagePercent}
        {memoryUsagePercent}
        foregroundColor={resolvedForegroundColor}
        mutedColor={resolvedMutedColor}
        lineColor={resolvedLineColor}
      />
    {/if}
  </Canvas>
</div>
