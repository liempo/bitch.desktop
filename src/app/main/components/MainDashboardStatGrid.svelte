<script lang="ts" module>
  export interface MainDashboardStat {
    label: string
    toneClass?: string
    value: number
  }
</script>

<script lang="ts">
  import Panel from '@/app/components/ui/Panel.svelte'

  interface Props {
    cardClass?: string
    class?: string
    formatValue?: (value: number) => string
    stats: readonly MainDashboardStat[]
  }

  let {
    cardClass = 'min-h-0 rounded-none! !border-line !bg-surface-raised',
    class: className = '',
    formatValue = value => String(value),
    stats
  }: Props = $props()

  const gridClass = $derived(`grid grid-cols-2 gap-2 text-center uppercase tracking-[0.12em] md:grid-cols-4 ${className}`)
</script>

<div class={gridClass}>
  {#each stats as stat (stat.label)}
    <Panel flat fullHeight={false} padded={false} class={cardClass} contentClass="p-2">
      <div class="text-[0.58rem] text-ink-muted">{stat.label}</div>
      <div class={`mt-1 text-[0.78rem] font-bold ${stat.toneClass ?? 'text-ink-bright'}`}>{formatValue(stat.value)}</div>
    </Panel>
  {/each}
</div>
