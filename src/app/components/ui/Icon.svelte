<script lang="ts">
  import { nerdIcon, type NerdIconName } from '$lib/theme'
  import type { SvelteHTMLElements } from 'svelte/elements'

  interface Props extends Omit<SvelteHTMLElements['span'], 'class' | 'children'> {
    class?: string
    decorative?: boolean
    label?: string
    name: NerdIconName
  }

  let { class: className = '', decorative, label, name, ...rest }: Props = $props()

  const classes = $derived(`inline-flex shrink-0 select-none items-center justify-center font-nerd leading-none ${className}`)
  const glyph = $derived(nerdIcon(name))
  const decorativeIcon = $derived(decorative ?? !label)
</script>

<span
  class={classes}
  aria-hidden={decorativeIcon ? 'true' : undefined}
  aria-label={decorativeIcon ? undefined : label}
  role={decorativeIcon ? undefined : 'img'}
  {...rest}
>{glyph}</span>
