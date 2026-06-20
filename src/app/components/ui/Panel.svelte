<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { SvelteHTMLElements } from 'svelte/elements'
  import { flatPanelSurfaceClass, panelSurfaceClass } from './styles'

  interface Props {
    title?: string
    badge?: string
    children: Snippet
    actions?: Snippet
    leading?: Snippet
    class?: string
    contentClass?: string
    flat?: boolean
    fullHeight?: boolean
    padded?: boolean
    titleClass?: string
  }

  let {
    title,
    badge,
    children,
    actions,
    leading,
    class: className = '',
    contentClass = '',
    flat = false,
    fullHeight = true,
    padded = true,
    titleClass = '',
    ...rest
  }: Props & Omit<SvelteHTMLElements['section'], 'class'> = $props()

  const shellClass = $derived(
    `${flat ? flatPanelSurfaceClass : panelSurfaceClass} flex ${fullHeight ? 'h-full' : ''} min-h-0 min-w-0 flex-col ${className}`
  )

  const bodyClass = $derived(
    `min-h-0 min-w-0 flex-1 overflow-hidden ${padded ? 'p-4 pt-5' : ''} ${contentClass}`
  )
</script>

<section class={shellClass} {...rest}>
  {#if title || leading}
    <div class="absolute -top-2.5 left-3 z-10 flex h-5 items-center gap-1 bg-canvas px-1.5 leading-none whitespace-nowrap">
      {#if leading}
        {@render leading()}
      {/if}
      {#if title}
        <header
          class="flex h-5 items-center text-[11px] font-bold text-ink-muted {titleClass}
            before:mr-1 before:text-line-strong before:content-['[']
            after:ml-1 after:text-line-strong after:content-[']']"
        >
          <span class="uppercase tracking-[0.05em]">{title}</span>
          {#if badge}
            <span
              class="ml-1.5 text-ink-bright
                before:mr-1 before:text-line-strong before:content-['[']
                after:ml-1 after:text-line-strong after:content-[']']"
            >
              {badge}
            </span>
          {/if}
        </header>
      {/if}
    </div>
  {/if}
  {#if actions}
    <div class="absolute -top-2.5 right-3 z-10 flex h-5 items-center gap-1 bg-canvas px-1.5 leading-none">
      {@render actions()}
    </div>
  {/if}
  <div class={bodyClass}>
    {@render children()}
  </div>
</section>
