<script lang="ts">
  import Panel from '@/app/components/ui/Panel.svelte'
  import {
    formatBytes,
    formatPercent,
    sortMonitoringContainers,
    type MonitoringContainerMetrics,
    type MonitoringContainerSortDirection,
    type MonitoringContainerSortKey,
    type MonitoringMetrics
  } from '$lib/monitoring'

  interface Props {
    class?: string
    error?: string
    metrics: MonitoringMetrics
    titleClass?: string
  }

  let { class: className = '', error = '', metrics, titleClass = '' }: Props = $props()

  let containerSortKey = $state<MonitoringContainerSortKey>('cpu')
  let containerSortDirection = $state<MonitoringContainerSortDirection>('desc')

  const containerRows = $derived(
    sortMonitoringContainers(metrics.containers, containerSortKey, containerSortDirection).slice(0, 12)
  )
  const containerCount = $derived(metrics.containerCount || metrics.containers.length)
  const containerEmptyLabel = 'No Beszel containers reported for this system.'

  function toggleContainerSort(key: MonitoringContainerSortKey): void {
    if (containerSortKey === key) {
      containerSortDirection = containerSortDirection === 'desc' ? 'asc' : 'desc'
      return
    }

    containerSortKey = key
    containerSortDirection = 'desc'
  }

  function containerSortLabel(key: MonitoringContainerSortKey): string {
    if (containerSortKey !== key) return ''
    return containerSortDirection === 'desc' ? ' ↓' : ' ↑'
  }

  function containerSortAriaLabel(key: MonitoringContainerSortKey, label: string): string {
    const nextDirection = containerSortKey === key && containerSortDirection === 'desc' ? 'ascending' : 'descending'
    return `Sort containers by ${label} ${nextDirection}`
  }

  function containerMemoryLabel(container: MonitoringContainerMetrics): string {
    return formatBytes(container.memoryBytes)
  }

  function containerDetailLabel(container: MonitoringContainerMetrics): string {
    const detail = [container.status, container.ports, container.image].filter(Boolean).join(' · ')
    return detail || 'container'
  }
</script>

<Panel title="CONTAINERS" class={className} contentClass="flex h-full min-h-0 flex-col gap-2" titleClass={titleClass}>
  <div class="flex shrink-0 items-center justify-between border border-line bg-canvas px-2 py-1 text-[0.66rem] uppercase tracking-[0.12em] text-ink-muted">
    <span>{containerCount} containers</span>
    <span>sort: {containerSortKey}/{containerSortDirection}</span>
  </div>

  <div class="grid shrink-0 grid-cols-[minmax(0,1fr)_3.6rem_5.6rem] gap-2 border-b border-line px-2 pb-1 text-[0.64rem] uppercase tracking-[0.12em] text-ink-muted">
    <span>Container</span>
    <button
      class="justify-self-end rounded-sm border-none bg-transparent p-0 text-right font-mono text-[0.64rem] uppercase tracking-[0.12em] text-primary transition-colors hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      type="button"
      aria-pressed={containerSortKey === 'cpu'}
      aria-label={containerSortAriaLabel('cpu', 'CPU')}
      onclick={() => toggleContainerSort('cpu')}
    >
      CPU{containerSortLabel('cpu')}
    </button>
    <button
      class="justify-self-end rounded-sm border-none bg-transparent p-0 text-right font-mono text-[0.64rem] uppercase tracking-[0.12em] text-primary transition-colors hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      type="button"
      aria-pressed={containerSortKey === 'memory'}
      aria-label={containerSortAriaLabel('memory', 'memory')}
      onclick={() => toggleContainerSort('memory')}
    >
      MEM{containerSortLabel('memory')}
    </button>
  </div>

  <div class="min-h-0 flex-1 overflow-auto px-3" aria-label="Containers">
    {#if containerRows.length}
      <div class="grid gap-1">
        {#each containerRows as container (container.id ?? `${container.name}:${container.image}`)}
          <div class="grid grid-cols-[minmax(0,1fr)_3.6rem_5.6rem] gap-2 border border-line bg-canvas px-2 py-1.5">
            <div class="min-w-0">
              <div class="truncate text-ink-bright">{container.name}</div>
              <div class="truncate text-[0.62rem] text-ink-muted" title={containerDetailLabel(container)}>
                {containerDetailLabel(container)}
              </div>
            </div>
            <div class="self-center text-right text-primary">{formatPercent(container.cpuPercent)}</div>
            <div class="self-center text-right text-secondary">{containerMemoryLabel(container)}</div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="border border-dashed border-line p-3 text-[0.68rem] text-ink-muted">
        {error ? 'Container data unavailable while monitoring is degraded.' : containerEmptyLabel}
      </div>
    {/if}
  </div>
</Panel>
