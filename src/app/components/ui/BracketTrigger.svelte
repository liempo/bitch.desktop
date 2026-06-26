<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements'

  interface Props extends Omit<HTMLButtonAttributes, 'class'> {
    class?: string
    label: string
    value?: null | string
    valueClass?: string
  }

  let {
    class: className = '',
    label,
    type = 'button',
    value = '',
    valueClass = '',
    ...rest
  }: Props = $props()

  const buttonClass = $derived(
    [
      'inline-flex max-w-20 items-center overflow-hidden whitespace-nowrap align-middle md:max-w-44 lg:max-w-56',
      'font-mono text-[10px] font-bold uppercase tracking-[0.05em]',
      'text-ink-muted hover:text-ink-bright',
      "before:mr-1 before:shrink-0 before:text-line-strong before:content-['['] after:ml-1 after:shrink-0 after:text-line-strong after:content-[']']",
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-ink-muted',
      className
    ].filter(Boolean).join(' ')
  )

  const valueText = $derived(value?.trim() ?? '')
  const defaultValueClass = 'ml-1 hidden min-w-0 truncate font-bold tracking-[0.05em] text-ink-bright md:inline-block'
  const mergedValueClass = $derived(`${defaultValueClass} ${valueClass}`)
</script>

<button {type} class={buttonClass} {...rest}>
  <span class="shrink-0">{label}</span>
  {#if valueText}
    <span class={mergedValueClass}>: {valueText}</span>
  {/if}
</button>
