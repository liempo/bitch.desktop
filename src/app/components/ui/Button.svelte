<script lang="ts" module>
  export type ButtonChrome = 'control' | 'ghost'
  export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'unstyled'
  export type ButtonSize = 'sm' | 'md' | 'icon'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements'

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'children'> {
    chrome?: ButtonChrome
    variant?: ButtonVariant
    size?: ButtonSize
    class?: string
    children: Snippet
    href?: string
    [key: string]: unknown
  }

  let {
    chrome = 'control',
    variant = 'default',
    size = 'md',
    href,
    type = 'button',
    class: className = '',
    children,
    ...rest
  }: Props = $props()

  const TONE_CLASSES: Record<Exclude<ButtonVariant, 'unstyled'>, string> = {
    default: 'text-ink-muted',
    primary: 'text-primary',
    secondary: 'text-secondary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger'
  }

  const BORDER_CLASSES: Record<Exclude<ButtonVariant, 'unstyled'>, string> = {
    default: 'border-line',
    primary: 'border-primary/50',
    secondary: 'border-secondary/50',
    success: 'border-success/50',
    warning: 'border-warning/50',
    danger: 'border-danger/50'
  }

  const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'min-h-6 px-2 py-0 text-[10px] tracking-[0.12em]',
    md: 'min-h-8 px-3 py-1 text-[11px] tracking-[0.1em]',
    icon: 'h-8 w-8 p-0 text-[11px] tracking-[0.1em]'
  }

  const BARE =
    'min-w-0 cursor-pointer border-none bg-transparent ' +
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ' +
    'disabled:cursor-not-allowed disabled:opacity-50'

  const CONTROL_LAYOUT = [
    'inline-flex items-center justify-center gap-1.5 rounded-control border font-mono font-semibold uppercase leading-none',
    'disabled:text-ink-muted'
  ].join(' ')

  const CONTROL_CHROME =
    'bg-surface-raised hover:border-line-strong hover:text-ink-bright disabled:hover:text-ink-muted'

  const GHOST_CHROME =
    'border-transparent bg-transparent hover:text-ink-bright disabled:hover:text-ink-muted'

  const classes = $derived(
    variant === 'unstyled'
      ? `${BARE} ${className}`
      : `${BARE} ${CONTROL_LAYOUT} ${SIZE_CLASSES[size]} ${TONE_CLASSES[variant]} ${
          chrome === 'control' ? `${CONTROL_CHROME} ${BORDER_CLASSES[variant]}` : GHOST_CHROME
        } ${className}`
  )
  const anchorRest = $derived(rest as HTMLAnchorAttributes)
  const buttonRest = $derived(rest as HTMLButtonAttributes)
</script>

{#if href}
  <a {href} class={classes} {...anchorRest}>
    {@render children()}
  </a>
{:else}
  <button {type} class={classes} {...buttonRest}>
    {@render children()}
  </button>
{/if}
