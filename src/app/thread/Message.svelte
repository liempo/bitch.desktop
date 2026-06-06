<script lang="ts">
  import CopyButton from './CopyButton.svelte'
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
      (message.reasoning?.trim().length ?? 0) > 0 ||
      message.tools.length > 0
  )

  const isRunning = $derived(message.pending === true)

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
  <div class="mx-auto w-full max-w-3xl px-4" data-role="tool">
    {#each message.tools as toolRow (toolRow.id)}
      <Tool tool={toolRow} />
    {/each}
  </div>
{:else if system}
  <!-- System message — centered, muted -->
  <div
    class="mx-auto max-w-[min(86%,44rem)] px-2 py-0.5 text-center text-[0.6875rem] leading-5 text-ink-muted/70"
    data-role="system"
  >
    <span class="whitespace-pre-wrap">{message.text}</span>
  </div>
{:else if user}
  <!-- User message — bubble style -->
  <div class="group mx-auto w-full max-w-3xl px-4 py-2" data-role="user">
    <div
      class="relative rounded-xl border border-line-strong/60 bg-message-bg px-3.5 py-2.5 shadow-sm"
    >
      <p class="whitespace-pre-wrap wrap-break-word text-[0.9375rem] leading-6 text-ink-bright">
        {message.text}
      </p>

      {#if timestamp}
        <time class="mt-1.5 block text-[0.65rem] text-ink-muted/70">{timestamp}</time>
      {/if}
    </div>
  </div>
{:else if assistant}
  <!-- Assistant message — content-first, action bar on hover -->
  <div
    class="group/msg relative mx-auto w-full max-w-3xl px-4 py-2"
    data-role="assistant"
    data-streaming={isRunning ? 'true' : undefined}
  >
    <div class="min-w-0 overflow-hidden text-pretty text-sm leading-6 text-ink">
      <!-- Thinking / Reasoning -->
      {#if message.reasoning}
        <Reasoning text={message.reasoning} pending={isRunning} />
      {/if}

      <!-- Tool calls -->
      {#if message.tools.length > 0}
        <div class="mt-1.5">
          {#each message.tools as toolRow (toolRow.id)}
            <Tool tool={toolRow} />
          {/each}
        </div>
      {/if}

      <!-- Content -->
      {#if message.text}
        <Markdown text={message.text} streaming={isRunning} />
      {:else if isRunning && !message.error && message.tools.length === 0}
        <div class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="h-2 w-2 animate-pulse rounded-full bg-success"></span>
          <span>Thinking…</span>
        </div>
      {/if}

      <!-- Error -->
      {#if message.error}
        <div
          class="mt-1.5 text-[0.78rem] leading-5 text-danger/70"
          role="alert"
        >
          {message.error}
        </div>
      {/if}
    </div>

    <!-- Action bar — visible on hover -->
    {#if hasContent && !isRunning}
      <div
        class="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100"
      >
        <CopyButton text={message.text} />
        {#if timestamp}
          <span class="ml-1 text-[0.65rem] text-ink-muted/50">{timestamp}</span>
        {/if}
      </div>
    {/if}

    <!-- Streaming indicator dot -->
    {#if isRunning}
      <span
        class="absolute right-4 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-success"
        aria-label="Streaming"
      ></span>
    {/if}
  </div>
{/if}
