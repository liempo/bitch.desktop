<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  type LoaderSize = 'sm' | 'md' | 'lg'
  type LoaderTone = 'primary' | 'secondary'

  interface Props {
    label?: string
    size?: LoaderSize
    tone?: LoaderTone
  }

  let { label, size = 'md', tone = 'primary' }: Props = $props()
  let frame = $state(0)
  let timer: ReturnType<typeof setInterval> | null = null

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  const sizeClass = $derived(
    size === 'sm' ? 'h-2.5 w-2.5 text-[0.7rem]' : size === 'lg' ? 'h-5 w-5 text-base' : 'h-3.5 w-3.5 text-xs'
  )
  const toneClass = $derived(tone === 'secondary' ? 'text-secondary' : 'text-primary')

  onMount(() => {
    timer = setInterval(() => {
      frame = (frame + 1) % frames.length
    }, 80)

    return () => {
      if (timer) clearInterval(timer)
      timer = null
    }
  })

  onDestroy(() => {
    if (timer) clearInterval(timer)
  })
</script>

<span
  class={`inline-flex ${sizeClass} shrink-0 items-center justify-center ${toneClass}`}
  aria-hidden={label ? undefined : 'true'}
  aria-label={label}
  role={label ? 'status' : undefined}
>
  <span class="block font-mono leading-none" aria-hidden="true">{frames[frame]}</span>
</span>
