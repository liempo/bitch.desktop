<script lang="ts">
  import { Popover } from 'bits-ui'
  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { popoverClass, sectionTitleClass, tagClass } from '@/app/components/ui/styles'
  import type { ButtonVariant } from '@/app/components/ui/Button.svelte'
  import type { ContextStatusRow, ContextStatusTone, ContextStatusViewModel } from '$lib/hermes/composer'

  interface Props {
    compact?: boolean
    viewModel: ContextStatusViewModel
  }

  let { compact = false, viewModel }: Props = $props()

  const contentClass = `${popoverClass} z-50 w-[min(30rem,calc(100vw-1rem))] p-0 font-mono shadow-xl shadow-black/30`
  const summaryClass = 'border-b border-line px-3 py-2 text-xs text-ink-bright'
  const sectionClass = 'space-y-1 px-3 py-2'
  const rowClass = 'grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2 text-[11px] leading-5'
  const labelClass = 'truncate uppercase tracking-[0.12em] text-ink-muted/75'

  function variantForTone(tone: ContextStatusTone): ButtonVariant {
    if (tone === 'active') return 'primary'
    if (tone === 'warning') return 'warning'
    if (tone === 'unavailable') return 'danger'
    return 'success'
  }

  function valueClass(row: ContextStatusRow): string {
    const toneClass =
      row.tone === 'active'
        ? 'text-primary'
        : row.tone === 'warning'
          ? 'text-warning'
          : row.tone === 'unavailable'
            ? 'text-danger'
            : 'text-ink-bright'

    return `min-w-0 break-words ${toneClass}`
  }
</script>

<Popover.Root>
  <Popover.Trigger title={viewModel.trigger.title} aria-label="Open context status popover">
    {#snippet child({ props })}
      <Button
        {...props}
        chrome="ghost"
        size={compact ? 'sm' : 'md'}
        variant={variantForTone(viewModel.trigger.tone)}
        class="shrink-0 rounded-none!"
      >
        {viewModel.trigger.label}
      </Button>
    {/snippet}
  </Popover.Trigger>

  <Popover.ContentStatic class={contentClass} sideOffset={6} align="end" forceMount={true}>
    <Panel title="Context status" fullHeight={false} padded={false} class="!bg-canvas" contentClass="p-0">
      <p class={summaryClass}>{viewModel.summary}</p>

      {#each viewModel.sections as section (section.id)}
        <section class={sectionClass} aria-label={section.title}>
          <div class={sectionTitleClass}>{section.title}</div>
          <dl class="mt-1 space-y-1">
            {#each section.rows as row (`${section.id}:${row.label}`)}
              <div class={rowClass}>
                <dt class={labelClass}>{row.label}</dt>
                <dd class={valueClass(row)}>{row.value}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}

      <div class="border-t border-line px-3 py-2">
        <span class={`${tagClass} border-line-strong/70 text-[0.58rem]`}>honest metadata only</span>
      </div>
    </Panel>
  </Popover.ContentStatic>
</Popover.Root>
