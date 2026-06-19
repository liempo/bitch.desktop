<script lang="ts">
  import Markdown from './Markdown.svelte'
  import MessageAttachments from './MessageAttachments.svelte'
  import Reasoning from './Reasoning.svelte'
  import System from './System.svelte'
  import Tool from './Tool.svelte'
  import { cardClass } from '@/components/ui/styles'
  import { profileForSession } from '$lib/stores/session.svelte'
  import type { ThreadMessage } from '$lib/stores/messages.svelte'
  import type { ThreadPreview } from '$lib/preview'

  interface Props {
    isLast?: boolean
    message: ThreadMessage
    onOpenPreview?: (preview: ThreadPreview) => void
    sessionId?: null | string
  }

  let { isLast = false, message, onOpenPreview, sessionId = null }: Props = $props()

  const assistant = $derived(message.role === 'assistant')
  const user = $derived(message.role === 'user')
  const system = $derived(message.role === 'system')
  const tool = $derived(message.role === 'tool')
  const timestamp = $derived(formatTimestamp(message.timestamp))
  const messageProfile = $derived(sessionId ? profileForSession(sessionId) : null)

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
  const userMessageClass = `${cardClass} w-fit max-w-[min(82%,42rem)] border-warning/35 !bg-warning/10 px-3.5 py-3`

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
      <Tool tool={toolRow} {onOpenPreview} />
    {/each}
  </div>
{:else if system}
  <div class="mx-auto w-full max-w-4xl px-4" data-role="system">
    <System text={message.text} lastInThread={isLast} />
  </div>
{:else if user}
  <!-- User message — bubble style -->
  <div class="group mx-auto flex w-full max-w-4xl justify-end px-4 py-3" data-role="user">
    <div class={userMessageClass}>
      {#if message.text}
        <p class="whitespace-pre-wrap wrap-break-word text-[0.9375rem] leading-6 text-ink-bright">
          {message.text}
        </p>
      {/if}
      <MessageAttachments attachments={message.attachments ?? []} profile={messageProfile} />
      {#if timestamp}
        <div class="mt-2 text-right text-[0.62rem] uppercase tracking-[0.16em] text-warning/80">
          <time class="text-ink-muted/70">{timestamp}</time>
        </div>
      {/if}
    </div>
  </div>
{:else if assistant}
  <!-- Assistant message — content-first, action bar on hover -->
  <div
    class="group/msg relative mx-auto w-full max-w-4xl px-4"
    data-role="assistant"
    data-streaming={isRunning ? 'true' : undefined}
  >
    <div>
      <div class="min-w-0 overflow-hidden text-pretty text-sm leading-6 text-ink">
        {#if usesParts}
          {#key toolStatusSignature}
            {#each parts as part, index (part.type === 'tool' ? `${part.tool.id}:${part.tool.status}` : index)}
              {#if part.type === 'reasoning'}
                <Reasoning text={part.text} pending={isRunning && index === parts.length - 1} />
              {:else if part.type === 'tool'}
                <div class="mt-1.5">
                  <Tool tool={part.tool} {onOpenPreview} />
                </div>
              {:else if part.type === 'text'}
                <Markdown text={part.text} streaming={isRunning && index === parts.length - 1} profile={messageProfile} {onOpenPreview} />
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
                <Tool tool={toolRow} {onOpenPreview} />
              {/each}
            </div>
          {/if}

          {#if message.text}
            <Markdown text={message.text} streaming={isRunning} profile={messageProfile} {onOpenPreview} />
          {/if}
        {/if}

        <MessageAttachments attachments={message.attachments ?? []} profile={messageProfile} />

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
