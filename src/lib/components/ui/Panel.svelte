<script lang="ts">
  interface Props {
    title?: string
    badge?: string
    children: import('svelte').Snippet
    actions?: import('svelte').Snippet
    leading?: import('svelte').Snippet
    padded?: boolean
  }

  let { title, badge, children, actions, leading, padded = true }: Props = $props()
</script>

<section class="relative flex h-full min-h-0 min-w-0 flex-col rounded-[var(--radius-panel)] border border-line bg-surface">
  {#if title || leading}
    <div class="absolute -top-2.5 left-3 z-10 flex h-5 items-center gap-1 bg-canvas px-1.5 leading-none whitespace-nowrap">
      {#if leading}
        {@render leading()}
      {/if}
      {#if title}
        <header
          class="flex h-5 items-center text-[11px] font-bold text-ink-muted
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
  <div class="min-h-0 min-w-0 flex-1 overflow-hidden" class:p-4={padded} class:pt-5={padded}>
    {@render children()}
  </div>
</section>
