<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements'
  import { textareaClass } from './styles'

  interface Props extends Omit<HTMLTextareaAttributes, 'class' | 'value'> {
    class?: string
    value?: string
  }

  let { class: className = '', value = $bindable(''), ...rest }: Props = $props()

  const classes = $derived(`${textareaClass} ${className}`)
</script>

<textarea bind:value class={classes} {...rest}></textarea>
