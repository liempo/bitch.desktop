<script lang="ts">
  import { onMount } from 'svelte'

  import GlyphCanvas from '@/app/components/GlyphCanvas.svelte'

  const SPLASH_MIN_DURATION_MS = 2600
  const SPLASH_REMOVE_AFTER_MS = 3200

  let visible = $state(true)
  let mounted = $state(true)

  onMount(() => {
    const hideTimer = window.setTimeout(() => {
      visible = false
    }, SPLASH_MIN_DURATION_MS)
    const removeTimer = window.setTimeout(() => {
      mounted = false
    }, SPLASH_REMOVE_AFTER_MS)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(removeTimer)
    }
  })
</script>

{#if mounted}
  <div
    class={`fixed inset-0 z-[2147483647] grid place-items-center bg-canvas transition-[opacity,visibility] duration-[420ms] ease-in ${visible ? 'opacity-100 visible' : 'pointer-events-none invisible opacity-0'}`}
    role="status"
    aria-label="Loading BITCH"
  >
    <GlyphCanvas class="h-[min(34vw,10rem)] w-[min(34vw,10rem)] overflow-hidden bg-black" />
  </div>
{/if}
