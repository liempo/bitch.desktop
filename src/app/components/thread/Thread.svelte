<script lang="ts">
  import { tick } from 'svelte'
  import Approval from '../prompts/Approval.svelte'
  import ClarifyCard from '../prompts/ClarifyCard.svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import bitchLogoUrl from '$lib/assets/bitch-logo.png'
  import Panel from '@/app/components/ui/Panel.svelte'
  import Message from './Message.svelte'
  import { messageState } from '$lib/hermes/threads'
  import { sessionState } from '$lib/hermes/sessions'
  import { resumeAndHydrateStoredSession } from '$lib/hermes/sessions'
  import type { ThreadPreview } from '$lib/hermes/threads'

  interface Props {
    compact?: boolean
    responsiveCompact?: boolean
    onOpenPreview?: (preview: ThreadPreview) => void
    sessionId?: null | string
  }

  let { compact = false, responsiveCompact = false, onOpenPreview, sessionId = null }: Props = $props()

  let scrollElement: HTMLElement | null = $state(null)
  let stickToBottom = $state(true)

  const thread = $derived(sessionId ? (messageState.sessions[sessionId] ?? null) : null)
  const messages = $derived(thread?.messages ?? [])
  const resumeExhausted = $derived(Boolean(sessionId) && sessionState.resumeExhaustedSessionId === sessionId)
  const loadingSession = $derived(
    Boolean(sessionId) &&
      !resumeExhausted &&
      messages.length === 0 &&
      (thread?.loading || sessionState.resumingSessionId === sessionId)
  )

  const sectionClass = $derived(
    compact
      ? 'flex-1 overflow-y-auto bg-chat-scroll/30'
      : responsiveCompact
        ? 'flex-1 overflow-y-auto bg-chat-scroll/30 md:bg-chat-scroll/40'
        : 'flex-1 overflow-y-auto bg-chat-scroll/40'
  )
  const emptyStateClass = $derived(
    compact
      ? 'flex min-h-full items-center justify-center px-3 py-6'
      : responsiveCompact
        ? 'flex min-h-full items-center justify-center px-3 py-6 md:px-6 md:py-16'
        : 'flex min-h-full items-center justify-center px-6 py-16'
  )
  const logoClass = $derived(
    compact
      ? 'h-16 w-16 rounded-panel bg-black object-contain opacity-90'
      : responsiveCompact
        ? 'h-16 w-16 rounded-panel bg-black object-contain opacity-90 md:h-28 md:w-28'
        : 'h-28 w-28 rounded-panel bg-black object-contain opacity-90'
  )
  const transcriptClass = $derived(compact ? 'py-2' : responsiveCompact ? 'py-2 md:py-4' : 'py-4')

  const scrollSignature = $derived(
    messages
      .map(message =>
        [
          message.id,
          message.text,
          message.reasoning,
          message.pending ? 'pending' : 'done',
          message.error ?? '',
          message.tools.map(tool => `${tool.id}:${tool.status}:${tool.summary}:${tool.context ?? ''}:${tool.error ?? ''}`).join(','),
          message.parts
            ?.map(part => {
              if (part.type === 'reasoning') return `reasoning:${part.text.length}`
              if (part.type === 'tool') return `tool:${part.tool.id}:${part.tool.status}`
              return `text:${part.text.length}`
            })
            .join(',') ?? ''
        ].join('|')
      )
      .join('\n')
  )

  $effect(() => {
    const signature = scrollSignature

    if (stickToBottom) {
      void tick().then(() => {
        if (signature === scrollSignature) {
          scrollToBottom()
        }
      })
    }
  })

  function handleScroll(): void {
    if (!scrollElement) return

    const distanceFromBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight
    stickToBottom = distanceFromBottom < 96
  }

  function scrollToBottom(): void {
    if (!scrollElement) return
    scrollElement.scrollTop = scrollElement.scrollHeight
  }

  function retryResume(): void {
    if (!sessionId) return
    sessionState.resumeFailedSessionId = null
    sessionState.resumeExhaustedSessionId = null
    sessionState.resumingSessionId = null
    void resumeAndHydrateStoredSession(sessionId)
  }


</script>

<section
  class={sectionClass}
  data-selectable="true"
  bind:this={scrollElement}
  onscroll={handleScroll}
  aria-label="Message thread"
>
  {#if !sessionId}
    <div class={emptyStateClass}>
      <img class={logoClass} src={bitchLogoUrl} alt="BITCH logo" />
    </div>
  {:else if loadingSession}
    <div class={emptyStateClass}>
      <Loader size={compact || responsiveCompact ? 'md' : 'xl'} label="Loading session" />
    </div>
  {:else if resumeExhausted}
    <div class={emptyStateClass}>
      <Panel title="Resume Failed" titleClass="text-danger" class="max-w-lg border-danger/40 bg-danger/10!" contentClass="p-5 text-sm leading-6 text-danger" padded={false} fullHeight={false}>
        <p class="font-semibold uppercase tracking-[0.12em]">Could not resume this session.</p>
        <p class="mt-2 text-danger/80">
          The gateway resume path failed after bounded retries. Retry will request a fresh runtime session for the same stored thread.
        </p>
        <Button class="mt-4" variant="secondary" onclick={retryResume}>Retry resume</Button>
      </Panel>
    </div>
  {:else if thread?.error && messages.length === 0}
    <div class={emptyStateClass}>
      <Panel title="Transcript Error" titleClass="text-danger" class="max-w-lg border-danger/40 bg-danger/10!" contentClass="p-5 text-sm leading-6 text-danger" padded={false} fullHeight={false}>
        <p class="font-semibold uppercase tracking-[0.12em]">Could not load the transcript.</p>
        <p class="mt-2 text-danger/80">{thread.error}</p>
      </Panel>
    </div>
  {:else if messages.length === 0}
    <div class={emptyStateClass}>
      <Panel title="Empty Buffer" titleClass="text-secondary" class="max-w-md" contentClass="p-5 text-center" padded={false} fullHeight={false}>
        <h2 class="text-xl font-semibold tracking-[0.08em] text-ink-bright">No messages yet</h2>
        <p class="mt-3 text-sm leading-6 text-ink-muted">
          History will appear here. Type in the composer below; the gateway will receive the message once the chromed courier lane is clear.
        </p>
      </Panel>
    </div>
  {:else}
    <div class={transcriptClass}>
      {#each messages as message, index (message.id)}
        <Message {message} {sessionId} {onOpenPreview} isLast={index === messages.length - 1} />
      {/each}

      {#if sessionId}
        <Approval {sessionId} />
        <ClarifyCard {sessionId} />
      {/if}
    </div>
  {/if}
</section>
