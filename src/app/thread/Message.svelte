<script lang="ts">
  import Markdown from './Markdown.svelte'
  import Reasoning from './Reasoning.svelte'
  import Tool from './Tool.svelte'
  import type { ThreadMessage } from '$lib/stores/messages.svelte'

  interface Props {
    message: ThreadMessage
  }

  let { message }: Props = $props()

  const assistant = $derived(message.role === 'assistant')
  const user = $derived(message.role === 'user')
  const system = $derived(message.role === 'system')
  const tool = $derived(message.role === 'tool')
  const timestamp = $derived(formatTimestamp(message.timestamp))

  const hasContent = $derived(
    message.text.trim().length > 0 ||
      (message.reasoning?.some(block => block.trim().length > 0) ?? false) ||
      message.tools.length > 0 ||
      (message.parts?.length ?? 0) > 0
  )

  const parts = $derived(message.parts ?? [])
  const usesParts = $derived(parts.length > 0)
  const toolStatusSignature = $derived(
    parts
      .filter((part): part is Extract<typeof part, { type: 'tool' }> => part.type === 'tool')
      .map(part => `${part.tool.id}:${part.tool.status}:${part.tool.output ?? ''}`)
      .join('|')
  )

  const isRunning = $derived(message.pending === true)
  const hasReasoningContent = $derived(
    usesParts
      ? parts.some(part => part.type === 'reasoning')
      : (message.reasoning?.length ?? 0) > 0
  )
  const showThinkingPlaceholder = $derived(
    isRunning &&
      !message.error &&
      !hasReasoningContent &&
      message.tools.length === 0 &&
      !message.text
  )

  function formatTimestamp(value: number | undefined): string {
    if (!value) return ''

    const millis = value < 1_000_000_000_000 ? value * 1000 : value
    const date = new Date(millis)

    if (Number.isNaN(date.getTime())) return ''

    const now = new Date()
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

    if (dayDelta === 0) return `Today, ${time}`
    if (dayDelta === 1) return `Yesterday, ${time}`

    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    })
  }
</script>

{#if tool}
  <!-- Tool result message — grouped tool rows -->
  <div class="mx-auto w-full max-w-4xl px-4" data-role="tool">
    {#each message.tools as toolRow (toolRow.id)}
      <Tool tool={toolRow} />
    {/each}
  </div>
{:else if system}
  <!-- System message — centered, muted -->
  <div
    class="mx-auto max-w-[min(86%,44rem)] px-4 py-1 text-center text-[0.6875rem] leading-5 text-ink-muted/80"
    data-role="system"
  >
    <div class="cli-message-system px-3 py-2">
      <span class="font-semibold uppercase tracking-[0.16em] text-secondary">SYS</span>
      <span class="ml-2 whitespace-pre-wrap">{message.text}</span>
    </div>
  </div>
{:else if user}
  <!-- User message — bubble style -->
  <div class="group mx-auto w-full max-w-4xl px-4 py-3" data-role="user">
    <div class="cli-message cli-message-user px-3.5 py-3">
      <div class="mb-2 flex items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-warning/80">
        <span>Operator_Input</span>
        {#if timestamp}
          <time class="text-ink-muted/70">{timestamp}</time>
        {/if}
      </div>
      <p class="whitespace-pre-wrap wrap-break-word text-[0.9375rem] leading-6 text-ink-bright">
        {message.text}
      </p>
    </div>
  </div>
{:else if assistant}
  <!-- Assistant message — content-first, action bar on hover -->
  <div
    class="group/msg relative mx-auto w-full max-w-4xl px-4 py-2"
    data-role="assistant"
    data-streaming={isRunning ? 'true' : undefined}
  >
    <div class="cli-message cli-message-assistant px-3.5 py-3">
      <div class="mb-2 flex items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.16em] text-primary/80">
        <span>Hermes_Output</span>
        {#if isRunning}
          <span class="animate-pulse text-success">streaming</span>
        {:else if hasContent && timestamp}
          <time class="text-ink-muted/70">{timestamp}</time>
        {/if}
      </div>

      <div class="min-w-0 overflow-hidden text-pretty text-sm leading-6 text-ink">
        {#if usesParts}
          {#key toolStatusSignature}
            {#each parts as part, index (part.type === 'tool' ? `${part.tool.id}:${part.tool.status}` : index)}
              {#if part.type === 'reasoning'}
                <Reasoning text={part.text} pending={isRunning && index === parts.length - 1} />
              {:else if part.type === 'tool'}
                <div class="mt-1.5">
                  <Tool tool={part.tool} />
                </div>
              {:else if part.type === 'text'}
                <Markdown text={part.text} streaming={isRunning && index === parts.length - 1} />
              {/if}
            {/each}
          {/key}
        {:else}
          <!-- Legacy fallback when parts is absent -->
          {#if message.reasoning && message.reasoning.length > 0}
            {#each message.reasoning as block, index (index)}
              <Reasoning text={block} pending={isRunning && index === message.reasoning.length - 1} />
            {/each}
          {/if}

          {#if message.tools.length > 0}
            <div class="mt-1.5">
              {#each message.tools as toolRow (toolRow.id)}
                <Tool tool={toolRow} />
              {/each}
            </div>
          {/if}

          {#if message.text}
            <Markdown text={message.text} streaming={isRunning} />
          {/if}
        {/if}

        {#if showThinkingPlaceholder}
          <Reasoning text="" pending={true} />
        {/if}

        <!-- Error -->
        {#if message.error}
          <div
            class="mt-1.5 text-[0.78rem] leading-5 text-danger/80"
            role="alert"
          >
            {message.error}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
