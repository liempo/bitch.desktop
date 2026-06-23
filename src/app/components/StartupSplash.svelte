<script lang="ts">
  import { onMount, type Component } from 'svelte'

  import { SPLASH_MIN_DURATION_MS, SPLASH_REMOVE_AFTER_MS, STARTUP_SPLASH_COMPLETE_EVENT } from '$lib/layout'

  type GlyphCanvasModule = { default: Component<{ class?: string }> }

  const glyphCanvasComponentPromise: Promise<GlyphCanvasModule> = import('@/app/components/GlyphCanvas.svelte')

  let visible = $state(true)
  let mounted = $state(true)

  onMount(() => {
    const hideTimer = window.setTimeout(() => {
      visible = false
    }, SPLASH_MIN_DURATION_MS)
    const removeTimer = window.setTimeout(() => {
      mounted = false
      window.dispatchEvent(new Event(STARTUP_SPLASH_COMPLETE_EVENT))
    }, SPLASH_REMOVE_AFTER_MS)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(removeTimer)
    }
  })
</script>

{#if mounted}
  <div
    class={`fixed inset-0 z-2147483647 grid place-items-center bg-canvas transition-[opacity,visibility] duration-420 ease-in ${visible ? 'opacity-100 visible' : 'pointer-events-none invisible opacity-0'}`}
    role="status"
    aria-label="Loading BITCH"
    data-startup-splash="true"
  >
    {#await glyphCanvasComponentPromise}
      <div class="h-[min(34vw,10rem)] w-[min(34vw,10rem)] overflow-hidden bg-black" aria-hidden="true"></div>
    {:then module}
      {@const GlyphCanvas = module.default}
      <GlyphCanvas class="h-[min(34vw,10rem)] w-[min(34vw,10rem)] overflow-hidden bg-black" />
    {/await}
  </div>
{/if}
