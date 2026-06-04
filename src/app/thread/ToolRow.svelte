<script lang="ts">
  import type { ThreadToolRow } from '$lib/stores/messages.svelte'

  interface Props {
    tool: ThreadToolRow
  }

  let { tool }: Props = $props()

  const statusLabel = $derived(tool.status === 'complete' ? 'done' : 'running')
</script>

<div class="my-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs shadow-sm shadow-black/10">
  <div class="flex items-center justify-between gap-3">
    <div class="min-w-0">
      <p class="truncate font-medium text-slate-300">{tool.name}</p>
      <p class="mt-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-slate-600">Tool call</p>
    </div>

    <span
      class={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${
        tool.status === 'complete'
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
          : 'border-sky-400/30 bg-sky-400/10 text-sky-300'
      }`}
    >
      {statusLabel}
    </span>
  </div>

  {#if tool.summary}
    <p class="mt-2 whitespace-pre-wrap wrap-break-word leading-5 text-slate-400">{tool.summary}</p>
  {/if}

  {#if tool.error}
    <p class="mt-2 whitespace-pre-wrap wrap-break-word rounded-lg border border-red-500/30 bg-red-500/10 p-2 leading-5 text-red-200">
      {tool.error}
    </p>
  {/if}
</div>
