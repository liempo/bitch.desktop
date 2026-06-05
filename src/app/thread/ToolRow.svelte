<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { ThreadToolRow, ThreadToolStatus } from '$lib/stores/messages.svelte'

  interface Props {
    tool: ThreadToolRow
  }

  let { tool }: Props = $props()

  let expanded = $state(false)
  let elapsed = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null

  const running = $derived(tool.status === 'running')
  const complete = $derived(tool.status === 'complete')
  const hasError = $derived(Boolean(tool.error))
  const hasDetail = $derived(Boolean(tool.input || tool.output || tool.error))
  const contextPreview = $derived(previewText(tool.context))
  const statusLabel = $derived(toolStatusLabel(tool.name, tool.status, hasError, Boolean(contextPreview)))
  const fallbackSummary = $derived(!contextPreview && tool.summary && !hasDetail ? tool.summary : '')
  const elapsedText = $derived(formatElapsed(elapsed))

  $effect(() => {
    if (!running) {
      elapsed = 0
      return
    }

    elapsed = 0
    timerInterval = setInterval(() => {
      elapsed += 1
    }, 1000)

    return () => {
      if (timerInterval) clearInterval(timerInterval)
      timerInterval = null
    }
  })

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval)
  })

  function toggle(): void {
    if (hasDetail) expanded = !expanded
  }

  function previewText(value: string | undefined): string {
    const text = value?.replace(/\s+/g, ' ').trim() ?? ''

    if (text.length <= 160) return text
    return `${text.slice(0, 157)}…`
  }

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  function humanizeToolName(name: string): string {
    const normalized = name.replace(/[_-]+/g, ' ').trim()
    if (!normalized) return 'tool'

    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }

  function toolStatusLabel(
    name: string,
    status: ThreadToolStatus,
    error: boolean,
    hasContext: boolean
  ): string {
    if (error) return 'Tool failed'

    const key = name.toLowerCase()

    if (status === 'running') {
      if (key === 'terminal') return hasContext ? 'Running' : 'Running command'
      if (key === 'execute_code') return 'Running code'
      if (key === 'web_search') return 'Searching web'
      if (key === 'web_extract') return 'Reading web page'
      if (key === 'browser_navigate') return 'Opening page'
      if (key === 'read_file') return 'Reading file'
      if (key === 'write_file') return 'Writing file'
      if (key === 'patch') return 'Editing file'
      if (key === 'delegate_task') return 'Running subagent'
      if (key === 'image_generate') return 'Generating image'
      return `Running ${humanizeToolName(name)}`
    }

    if (key === 'terminal') return 'Ran command'
    if (key === 'execute_code') return 'Ran code'
    if (key === 'web_search') return 'Searched web'
    if (key === 'web_extract') return 'Read web page'
    if (key === 'browser_navigate') return 'Opened page'
    if (key === 'read_file') return 'Read file'
    if (key === 'write_file') return 'Wrote file'
    if (key === 'patch') return 'Edited file'
    if (key === 'delegate_task') return 'Subagent finished'
    if (key === 'image_generate') return 'Generated image'
    return `${humanizeToolName(name)} complete`
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
        <span class="h-2 w-2 rounded-[2px] bg-slate-600/80" aria-label="Complete"></span>
      {/if}
    </span>

    <!-- Tool title + gateway context preview -->
    <span class="min-w-0 flex-1">
      <span class="flex min-w-0 items-baseline gap-1.5">
        <span class="shrink-0 font-medium {running ? 'animate-pulse text-slate-400' : 'text-slate-300'}">
          {statusLabel}
        </span>
        {#if contextPreview}
          <span class="truncate text-slate-500">· {contextPreview}</span>
        {/if}
      </span>
      {#if fallbackSummary}
        <span class="mt-0.5 block truncate text-slate-500">{fallbackSummary}</span>
      {/if}
    </span>

    {#if running}
      <span class="shrink-0 tabular-nums text-slate-600">{elapsedText}</span>
    {/if}

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
    <div class="space-y-2 border-t border-slate-800/50 px-3 py-2">
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
