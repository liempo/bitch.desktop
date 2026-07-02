<script lang="ts">
  import { iconSvg, type IconName } from '$lib/theme'
  import type { SvelteHTMLElements } from 'svelte/elements'

  interface Props extends Omit<SvelteHTMLElements['span'], 'class' | 'children'> {
    class?: string
    decorative?: boolean
    label?: string
    name: IconName
  }

  let { class: className = '', decorative, label, name, ...rest }: Props = $props()

  const classes = $derived(`prime-icon inline-flex shrink-0 select-none items-center justify-center align-[-0.125em] leading-none ${className}`)
  const markup = $derived(iconSvg(name))
  const decorativeIcon = $derived(decorative ?? !label)
</script>

<span
  class={classes}
  aria-hidden={decorativeIcon ? 'true' : undefined}
  aria-label={decorativeIcon ? undefined : label}
  role={decorativeIcon ? undefined : 'img'}
  {...rest}
>{@html markup}</span>

<style>
  .prime-icon :global(svg) {
    display: block;
    width: 1em;
    height: 1em;
    color: inherit;
    fill: currentColor;
  }

  .prime-icon :global(path),
  .prime-icon :global(circle),
  .prime-icon :global(rect),
  .prime-icon :global(polygon),
  .prime-icon :global(polyline),
  .prime-icon :global(line) {
    fill: currentColor;
  }
</style>
