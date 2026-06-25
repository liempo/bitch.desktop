<script lang="ts">
  import { onDestroy } from 'svelte'
  import Icon from '@/app/components/ui/Icon.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import TerminalBlock from '@/app/components/ui/TerminalBlock.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import type { ConversationTool, ConversationToolStatus } from '$lib/hermes/conversations'

  interface Props {
    tool: ConversationTool
  }

  let { tool }: Props = $props()

  let expanded = $state(false)
  let elapsed = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null

  const running = $derived(tool.status === 'running')
  const hasError = $derived(Boolean(tool.error))
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

  function humanizeToolName(name: string): string {
    const normalized = name.replace(/[_-]+/g, ' ').trim()
    if (!normalized) return 'tool'

    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }

  function toolStatusLabel(
    name: string,
    status: ConversationToolStatus,
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
          <Icon name="error" label="Error" decorative={false} class="h-3.5 w-3.5 text-danger" />
        {/if}
      </span>
    {/if}

      {#if hasDetail}
        <Icon name="chevronRight" class="h-3 w-3 text-ink-muted/70 {expanded ? 'rotate-90' : ''}" />
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
