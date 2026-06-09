<script lang="ts">
  import { Dialog as BitsDialog } from 'bits-ui'
  import type { Snippet } from 'svelte'
  import { popoverClass } from './styles'

  interface Props {
    children: Snippet
    class?: string
    contentClass?: string
    description?: string
    descriptionClass?: string
    open?: boolean
    title: string
    titleClass?: string
  }

  let {
    children,
    class: className = '',
    contentClass = '',
    description = '',
    descriptionClass = '',
    open = $bindable(false),
    title,
    titleClass = ''
  }: Props = $props()

  const dialogClass = $derived(
    `${popoverClass} fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden font-mono ${className}`
  )
  const bodyClass = $derived(`min-h-0 overflow-hidden ${contentClass}`)
</script>

<BitsDialog.Root bind:open>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class="fixed inset-0 z-40 bg-overlay" />
    <BitsDialog.Content class={dialogClass}>
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-line px-3 py-2">
        <div class="min-w-0">
          <BitsDialog.Title class={`text-[11px] font-bold uppercase tracking-[0.14em] text-primary ${titleClass}`}>
            {title}
          </BitsDialog.Title>
          {#if description}
            <BitsDialog.Description class={`pt-1 text-[10px] uppercase tracking-[0.1em] text-ink-muted ${descriptionClass}`}>
              {description}
            </BitsDialog.Description>
          {/if}
        </div>
        <BitsDialog.Close class="border-none bg-transparent px-1 py-0 text-xs text-ink-muted hover:text-ink-bright" aria-label="Close dialog">
          x
        </BitsDialog.Close>
      </div>

      <div class={bodyClass}>
        {@render children()}
      </div>
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>
