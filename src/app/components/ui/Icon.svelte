<script lang="ts">
  import { iconPath, type IconName } from '$lib/theme'
  import type { SVGAttributes } from 'svelte/elements'

  interface Props extends Omit<SVGAttributes<SVGSVGElement>, 'class' | 'children'> {
    class?: string
    decorative?: boolean
    label?: string
    name: IconName
  }

  let { class: className = '', decorative, label, name, ...rest }: Props = $props()

  const classes = $derived(`inline-block shrink-0 select-none align-[-0.125em] ${className}`)
  const path = $derived(iconPath(name))
  const decorativeIcon = $derived(decorative ?? !label)
</script>

<svg
  class={classes}
  width="1em"
  height="1em"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={decorativeIcon ? 'true' : undefined}
  aria-label={decorativeIcon ? undefined : label}
  role={decorativeIcon ? undefined : 'img'}
  focusable="false"
  {...rest}
>
  <path d={path}></path>
</svg>
