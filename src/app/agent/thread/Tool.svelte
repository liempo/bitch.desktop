<script lang="ts">
  import { onDestroy } from 'svelte'
  import Loader from '@/components/ui/Loader.svelte'
  import TerminalBlock from '@/components/ui/TerminalBlock.svelte'
  import { cardClass } from '@/components/ui/styles'
  import type { ThreadSubtask, ThreadSubtaskOutput, ThreadTool, ThreadToolStatus } from '$lib/stores/messages.svelte'

  interface Props {
    tool: ThreadTool
  }

  let { tool }: Props = $props()

  let expanded = $state(false)
  let elapsed = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null

  const running = $derived(tool.status === 'running')
  const hasError = $derived(Boolean(tool.error))
  const delegateSubtasks = $derived(tool.name === 'delegate_task' ? (tool.subtasks ?? []) : [])
  const hasDetail = $derived(Boolean(tool.input || tool.output || tool.error))
  const contextPreview = $derived(previewText(tool.context))
  const statusLabel = $derived(toolStatusLabel(tool.name, tool.status, hasError, Boolean(contextPreview)))
  const fallbackSummary = $derived(!contextPreview && tool.summary && !hasDetail ? tool.summary : '')
  const elapsedText = $derived(formatElapsed(elapsed))
  const toolCardClass = $derived(
    `${cardClass} my-1.5 overflow-hidden border-dashed ${hasError ? 'border-danger/35 !bg-danger/5' : 'border-line'} text-xs`
  )

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

  function formatDuration(seconds: number | undefined): string {
    if (seconds === undefined) return ''
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`

    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
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

  function subagentStatusLabel(status: ThreadSubtask['status']): string {
    if (status === 'complete') return 'Done'
    if (status === 'failed') return 'Failed'
    if (status === 'queued') return 'Queued'
    return 'Running'
  }

  function subagentStatusClass(status: ThreadSubtask['status']): string {
    if (status === 'complete') return 'text-success'
    if (status === 'failed') return 'text-danger'
    if (status === 'queued') return 'text-ink-muted'
    return 'text-primary'
  }

  function subagentDotClass(status: ThreadSubtask['status']): string {
    if (status === 'complete') return 'bg-success'
    if (status === 'failed') return 'bg-danger'
    if (status === 'queued') return 'bg-ink-muted/70'
    return 'bg-primary'
  }

  function subagentOrdinal(subtask: ThreadSubtask): string {
    if (subtask.taskIndex === undefined) return ''

    const current = subtask.taskIndex + 1
    return subtask.taskCount && subtask.taskCount > 1 ? `${current}/${subtask.taskCount}` : `${current}`
  }

  function modelLabel(model: string | undefined): string {
    return model?.split('/').pop() || ''
  }

  function subagentMeta(subtask: ThreadSubtask): string[] {
    const meta: string[] = []

    if (subtask.toolCount !== undefined) meta.push(`${subtask.toolCount} tools`)
    if (subtask.apiCalls !== undefined) meta.push(`${subtask.apiCalls} calls`)

    const duration = formatDuration(subtask.durationSeconds)
    if (duration) meta.push(duration)

    const model = modelLabel(subtask.model)
    if (model) meta.push(model)

    return meta
  }

  function subagentProgressText(subtask: ThreadSubtask): string {
    return previewText(subtask.error || subtask.summary || subtask.toolPreview || subtask.text)
  }

  function subagentOutputTail(subtask: ThreadSubtask): ThreadSubtaskOutput[] {
    return (subtask.outputTail ?? []).slice(-2)
  }
</script>

<div class={toolCardClass}>
  <button
    class="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left {hasDetail
      ? 'cursor-pointer'
      : 'cursor-default'}"
    onclick={toggle}
    type="button"
    disabled={!hasDetail}
    aria-expanded={hasDetail ? expanded : undefined}
  >
    {#if running || hasError}
      <span class="grid h-3.5 w-3.5 shrink-0 place-items-center">
        {#if running}
          <Loader />
        {:else if hasError}
          <svg
            class="h-3.5 w-3.5 text-danger"
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
        {/if}
      </span>
    {/if}

    {#if hasDetail}
      <svg
        class="h-3 w-3 shrink-0 text-ink-muted/70 {expanded ? 'rotate-90' : ''}"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    {/if}

    <span class="min-w-0 flex-1">
      <span class="flex min-w-0 items-baseline gap-1.5">
        <span class="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] {running ? 'text-primary' : hasError ? 'text-danger' : 'text-ink'}">
          {statusLabel}
        </span>
        {#if contextPreview}
          <span class="truncate text-ink-muted">· {contextPreview}</span>
        {/if}
      </span>
      {#if fallbackSummary}
        <span class="mt-0.5 block truncate text-ink-muted">{fallbackSummary}</span>
      {/if}
    </span>

    {#if running}
      <span class="shrink-0 tabular-nums text-ink-muted/70">{elapsedText}</span>
    {/if}
  </button>

  {#if delegateSubtasks.length > 0}
    <div class="space-y-1.5 border-t border-line/50 px-3 pb-2 pt-2">
      <div class="text-[0.62rem] font-medium uppercase tracking-[0.1em] text-ink-muted/70">
        Subtasks
      </div>

      <div class="space-y-1">
        {#each delegateSubtasks as subtask (subtask.id)}
          <div class="rounded-md border border-line/60 bg-canvas/35 px-2 py-1.5">
            <div class="flex min-w-0 items-center gap-1.5">
              <span class="h-1.5 w-1.5 shrink-0 rounded-full {subagentDotClass(subtask.status)}"></span>
              <span class="shrink-0 text-[0.62rem] font-semibold uppercase tracking-[0.1em] {subagentStatusClass(subtask.status)}">
                {subagentStatusLabel(subtask.status)}
              </span>
              {#if subagentOrdinal(subtask)}
                <span class="shrink-0 text-[0.65rem] tabular-nums text-ink-muted/70">
                  {subagentOrdinal(subtask)}
                </span>
              {/if}
              <span class="truncate font-medium text-ink">{previewText(subtask.goal)}</span>
            </div>

            {#if subagentProgressText(subtask)}
              <p class="mt-1 truncate {subtask.status === 'failed' ? 'text-danger/80' : 'text-ink-muted'}">
                {subagentProgressText(subtask)}
              </p>
            {/if}

            <div class="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[0.65rem] text-ink-muted/70">
              {#if subtask.toolName}
                <span class="truncate">{humanizeToolName(subtask.toolName)}</span>
              {/if}
              {#each subagentMeta(subtask) as item}
                <span>{item}</span>
              {/each}
            </div>

            {#if subagentOutputTail(subtask).length > 0}
              <div class="mt-1 space-y-0.5">
                {#each subagentOutputTail(subtask) as output}
                  <p class="truncate text-[0.65rem] {output.isError ? 'text-danger/80' : 'text-ink-muted/75'}">
                    {output.tool}: {previewText(output.preview)}
                  </p>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if expanded && hasDetail}
    <div class="space-y-2 border-t border-line/50 px-3 py-2">
      {#if tool.summary}
        <p class="whitespace-pre-wrap wrap-break-word leading-5 text-ink-muted">{tool.summary}</p>
      {/if}

      {#if tool.input}
        <div>
          <p class="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-ink-muted/70">
            Input
          </p>
          <TerminalBlock class="max-h-20 overflow-auto px-2 py-1.5 text-[0.7rem] leading-relaxed text-ink-muted">{tool.input}</TerminalBlock>
        </div>
      {/if}

      {#if tool.output}
        <div>
          <p class="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-ink-muted/70">
            Output
          </p>
          <TerminalBlock class="max-h-20 overflow-auto px-2 py-1.5 text-[0.7rem] leading-relaxed text-ink-muted">{tool.output}</TerminalBlock>
        </div>
      {/if}

      {#if tool.error}
        <TerminalBlock class="whitespace-pre-wrap wrap-break-word border-danger/30 !bg-danger/5 p-2 leading-5 !text-danger/80">
          {tool.error}
        </TerminalBlock>
      {/if}
    </div>
  {/if}
</div>
