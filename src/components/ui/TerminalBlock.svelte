<script lang="ts">
  import type { Snippet } from 'svelte'
  import { terminalClass } from './styles'

  interface Props {
    children: Snippet
    class?: string
  }

  let { children, class: className = '' }: Props = $props()

  const classes = $derived(`${terminalClass} ${className}`)
</script>

<pre class={classes}>{@render children()}</pre>
