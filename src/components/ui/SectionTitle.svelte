<script lang="ts" module>
  export type SectionTone = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { sectionTitleClass } from './styles'

  interface Props {
    children: Snippet
    class?: string
    tone?: SectionTone
  }

  let { children, class: className = '', tone = 'default' }: Props = $props()

  const toneClass: Record<SectionTone, string> = {
    default: '',
    primary: 'text-primary',
    secondary: 'text-secondary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger'
  }

  const classes = $derived(`${sectionTitleClass} ${toneClass[tone]} ${className}`)
</script>

<p class={classes}>
  {@render children()}
</p>
