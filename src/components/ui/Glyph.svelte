<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  interface Props {
    class?: string
    label?: string
  }

  let { class: className = '', label = 'Animated placeholder glyph' }: Props = $props()

  let frame = $state(0)
  let timer: ReturnType<typeof setInterval> | null = null

  const frames = [
    `    .
   .:.
  .:-:.
 .:-=-:.
  .:-:.
   .:.
    .    `,
    `    :
   :.:
  :-=-:
 :-+*+-:
  :-=-:
   :.:
    :    `,
    `    |
   |:|
  |=*=|
 |=#@#=|
  |=*=|
   |:|
    |    `,
    `    :
   :.:
  :-=-:
 :-+*+-:
  :-=-:
   :.:
    :    `
  ]

  onMount(() => {
    timer = setInterval(() => {
      frame = (frame + 1) % frames.length
    }, 180)

    return () => {
      if (timer) clearInterval(timer)
      timer = null
    }
  })

  onDestroy(() => {
    if (timer) clearInterval(timer)
  })
</script>

<figure
  class={`inline-flex items-center justify-center px-5 py-4 text-primary ${className}`}
  aria-label={label}
  role="img"
>
  <pre class="select-none whitespace-pre font-mono text-[0.7rem] leading-[0.85] tracking-[0.18em]" aria-hidden="true">{frames[frame]}</pre>
</figure>
