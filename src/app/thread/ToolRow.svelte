<script lang="ts">
  import type { ThreadToolRow } from '$lib/stores/messages.svelte'

  interface Props {
    tool: ThreadToolRow
  }

  let { tool }: Props = $props()

  let expanded = $state(false)

  const running = $derived(tool.status === 'running')
  const complete = $derived(tool.status === 'complete')
  const hasError = $derived(Boolean(tool.error))
  const hasDetail = $derived(Boolean(tool.input || tool.output || tool.error))

  function toggle(): void {
    if (hasDetail) expanded = !expanded
  }
</script>

<div
  class="my-1.5 overflow-hidden rounded-lg border {hasError
    ? 'border-red-500/25'
    : 'border-slate-800/80'} bg-slate-950/50 text-xs"
>
  <!-- Header row -->
  <button
    class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors {hasDetail
      ? 'hover:bg-slate-900/50 cursor-pointer'
      : 'cursor-default'}"
    onclick={toggle}
    type="button"
    disabled={!hasDetail}
    aria-expanded={hasDetail ? expanded : undefined}
  >
    <!-- Status glyph -->
    <span class="grid h-3.5 w-3.5 shrink-0 place-items-center">
      {#if running}
        <span class="h-3 w-3 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400"
        ></span>
      {:else if hasError}
        <svg
          class="h-3.5 w-3.5 text-red-400"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
          aria-label="Error"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      {:else if complete}
        <svg
          class="h-3.5 w-3.5 text-emerald-400/70"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
          aria-label="Complete"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      {/if}
    </span>

    <!-- Tool name + summary -->
    <span class="min-w-0 flex-1">
      <span class="font-medium text-slate-300">{tool.name}</span>
      {#if tool.summary && !hasDetail}
        <span class="ml-1.5 text-slate-500">· {tool.summary}</span>
      {/if}
    </span>

    <!-- Chevron for expandable -->
    {#if hasDetail}
      <svg
        class="h-3 w-3 shrink-0 text-slate-600 transition-transform {expanded ? 'rotate-90' : ''}"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    {/if}
  </button>

  <!-- Expanded detail -->
  {#if expanded && hasDetail}
    <div class="border-t border-slate-800/50 px-3 py-2 space-y-2">
      {#if tool.summary}
        <p class="whitespace-pre-wrap wrap-break-word leading-5 text-slate-400">{tool.summary}</p>
      {/if}

      {#if tool.input}
        <div>
          <p class="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-slate-600">
            Input
          </p>
          <pre
            class="max-h-20 overflow-auto rounded-md bg-slate-900/70 px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed text-slate-400">{tool.input}</pre>
        </div>
      {/if}

      {#if tool.output}
        <div>
          <p class="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-slate-600">
            Output
          </p>
          <pre
            class="max-h-20 overflow-auto rounded-md bg-slate-900/70 px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed text-slate-400">{tool.output}</pre>
        </div>
      {/if}

      {#if tool.error}
        <p
          class="whitespace-pre-wrap wrap-break-word rounded-md border border-red-500/20 bg-red-500/5 p-2 leading-5 text-red-300/80"
        >
          {tool.error}
        </p>
      {/if}
    </div>
  {/if}
</div>
