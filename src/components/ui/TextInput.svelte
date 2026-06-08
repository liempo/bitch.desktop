<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'
  import { inputClass } from './styles'

  interface Props extends Omit<HTMLInputAttributes, 'class' | 'value'> {
    class?: string
    value?: string
  }

  let { class: className = '', type = 'text', value = $bindable(''), ...rest }: Props = $props()

  const classes = $derived(`${inputClass} ${className}`)
</script>

<input bind:value {type} class={classes} {...rest} />
