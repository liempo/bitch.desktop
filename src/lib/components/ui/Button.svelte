<script lang="ts" module>
  export type ButtonVariant = 'default' | 'primary' | 'success' | 'danger' | 'unstyled'
  export type ButtonSize = 'sm' | 'md'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  // Flat, text-only button styled like the workspace sidebar's
  // `.icon-btn`: no border, no fill, hover swaps the text color. The
  // only thing that changes between variants is the resting/hover text
  // color so primary/secondary/danger always have identical geometry.
  //
  // `variant="unstyled"` drops the flat-text geometry (inline-flex,
  // justify-center, font-mono uppercase, size padding) and keeps only the
  // universal bits (cursor, transparent bg, transition, disabled state).
  // Callers then own layout fully via `class` - useful for row containers
  // where the button is a layout box, not a text label.

  interface Props extends Omit<HTMLButtonAttributes, 'class' | 'children'> {
    variant?: ButtonVariant
    size?: ButtonSize
    class?: string
    children: Snippet
  }

  let {
    variant = 'default',
    size = 'md',
    type = 'button',
    class: className = '',
    children,
    ...rest
  }: Props = $props()

  const VARIANT_CLASSES: Record<Exclude<ButtonVariant, 'unstyled'>, string> = {
    default: 'text-ink-muted hover:text-ink-bright',
    primary: 'text-primary hover:text-ink-bright',
    success: 'text-success hover:text-ink-bright',
    danger: 'text-ink-muted hover:text-danger'
  }

  const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-2 py-0 text-[10px] tracking-[0.12em]',
    md: 'px-3 py-1 text-[11px] tracking-[0.1em]'
  }

  const BARE =
    'cursor-pointer border-none bg-transparent transition-colors min-w-0 ' +
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ' +
    'disabled:cursor-not-allowed disabled:opacity-50'

  const TEXT_GEOMETRY = 'inline-flex items-center justify-center gap-1.5 font-mono uppercase disabled:text-ink-muted'

  const classes = $derived(
    variant === 'unstyled'
      ? `${BARE} ${className}`
      : `${BARE} ${TEXT_GEOMETRY} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`
  )
</script>

<button {type} class={classes} {...rest}>
  {@render children()}
</button>
