<script lang="ts">
  import { tick } from 'svelte'
  import Approval from '../prompts/Approval.svelte'
  import ClarifyCard from '../prompts/ClarifyCard.svelte'
  import GlyphCanvas from '@/app/components/GlyphCanvas.svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import ConversationTimelineRail from './ConversationTimelineRail.svelte'
  import Message from './Message.svelte'
  import RemoteTranscriptTabs from './RemoteTranscriptTabs.svelte'
  import {
    extractConversationTimelineMarkers,
    extractRemoteToolTranscriptsFromMessages,
    messageState
  } from '$lib/hermes/conversations'
  import { sessionState } from '$lib/hermes/sessions'
  import { resumeAndHydrateStoredSession } from '$lib/hermes/sessions'
  import { clarifyRequestForSession, promptsState } from '$lib/hermes/prompts'
  import type { ConversationPreview, ConversationTimelineMarker, ConversationTimelinePromptKind } from '$lib/hermes/conversations'

  interface Props {
    compact?: boolean
    responsiveCompact?: boolean
    onOpenPreview?: (preview: ConversationPreview) => void
    sessionId?: null | string
  }

  let { compact = false, responsiveCompact = false, onOpenPreview, sessionId = null }: Props = $props()

  let scrollElement: HTMLElement | null = $state(null)
  let stickToBottom = $state(true)
  let transcriptPanelOpen = $state(false)
  let requestedTranscriptId = $state<string | null>(null)
  let requestedTranscriptSequence = $state(0)

  const conversation = $derived(sessionId ? (messageState.sessions[sessionId] ?? null) : null)
  const messages = $derived(conversation?.messages ?? [])
  const remoteTranscripts = $derived(sessionId ? extractRemoteToolTranscriptsFromMessages(sessionId, messages) : [])
  const approvalRequest = $derived(promptsState.approvalRequest)
  const clarifyRequest = $derived(sessionId ? clarifyRequestForSession(sessionId) : null)
  const approvalVisible = $derived(Boolean(approvalRequest && (!approvalRequest.sessionId || !sessionId || approvalRequest.sessionId === sessionId)))
  const pendingPrompt = $derived.by<ConversationTimelinePromptKind | null>(() => {
    if (approvalVisible) return 'approval'
    if (clarifyRequest) return 'clarify'
    if (conversation?.needsInput) return 'input'
    return null
  })
  const timelineMarkers = $derived(extractConversationTimelineMarkers(messages, { pendingPrompt }))
  const resumeExhausted = $derived(Boolean(sessionId) && sessionState.resumeExhaustedSessionId === sessionId)
  const loadingSession = $derived(
    Boolean(sessionId) &&
      !resumeExhausted &&
      messages.length === 0 &&
      (conversation?.loading || sessionState.resumingSessionId === sessionId)
  )

  const shellClass = 'relative flex min-h-0 flex-1 overflow-hidden'
  const showTimeline = $derived(!compact && timelineMarkers.length > 0)
  const sectionClass = 'flex-1 overflow-y-auto bg-transparent'
  const emptyStateClass = $derived(
    compact
      ? 'flex min-h-full items-center justify-center px-3 py-6'
      : responsiveCompact
        ? 'flex min-h-full items-center justify-center px-3 py-6 md:px-6 md:py-16'
        : 'flex min-h-full items-center justify-center px-6 py-16'
  )
  const glyphClass = $derived(
    compact
      ? 'h-16 w-16 overflow-hidden rounded-panel bg-transparent opacity-90'
      : responsiveCompact
        ? 'h-16 w-16 overflow-hidden rounded-panel bg-transparent opacity-90 md:h-28 md:w-28'
        : 'h-28 w-28 overflow-hidden rounded-panel bg-transparent opacity-90'
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
          message.tools.map(tool => `${tool.id}:${tool.status}:${tool.summary}:${tool.context ?? ''}:${tool.output ?? ''}:${tool.stdout ?? ''}:${tool.stderr ?? ''}:${tool.error ?? ''}:${tool.exitStatus ?? ''}`).join(','),
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
    if (transcriptPanelOpen && remoteTranscripts.length === 0) {
      transcriptPanelOpen = false
      requestedTranscriptId = null
    }
  })

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

  function openTranscript(toolId: string): void {
    if (!sessionId) return

    requestedTranscriptId = `${sessionId}:${toolId}`
    requestedTranscriptSequence += 1
    transcriptPanelOpen = true
  }

  function closeTranscriptTabs(): void {
    transcriptPanelOpen = false
  }

  function findTimelineAnchor(messageId: string): HTMLElement | null {
    if (!scrollElement) return null

    return (
      Array.from(scrollElement.querySelectorAll<HTMLElement>('[data-conversation-message-id]')).find(
        element => element.dataset.conversationMessageId === messageId
      ) ?? null
    )
  }

  function scrollToTimelineMarker(marker: ConversationTimelineMarker): void {
    const target = findTimelineAnchor(marker.messageId)
    if (!target) return

    stickToBottom = false
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function retryResume(): void {
    if (!sessionId) return
    sessionState.resumeFailedSessionId = null
    sessionState.resumeExhaustedSessionId = null
    sessionState.resumingSessionId = null
    void resumeAndHydrateStoredSession(sessionId)
  }


</script>

<div class={shellClass}>
  <section
    class={sectionClass}
    data-selectable="true"
    bind:this={scrollElement}
    onscroll={handleScroll}
    aria-label="Message conversation"
  >
    {#if !sessionId}
      <div class={emptyStateClass}>
        <GlyphCanvas class={glyphClass} />
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
            The gateway resume path failed after bounded retries. Retry will request a fresh runtime session for the same stored conversation.
          </p>
          <Button class="mt-4" variant="secondary" onclick={retryResume}>Retry resume</Button>
        </Panel>
      </div>
    {:else if conversation?.error && messages.length === 0}
      <div class={emptyStateClass}>
        <Panel title="Transcript Error" titleClass="text-danger" class="max-w-lg border-danger/40 bg-danger/10!" contentClass="p-5 text-sm leading-6 text-danger" padded={false} fullHeight={false}>
          <p class="font-semibold uppercase tracking-[0.12em]">Could not load the transcript.</p>
          <p class="mt-2 text-danger/80">{conversation.error}</p>
        </Panel>
      </div>
    {:else if messages.length === 0}
      <div class={emptyStateClass}>
        <Loader size={compact || responsiveCompact ? 'md' : 'xl'} label="Loading session" />
      </div>
    {:else}
      <div class={transcriptClass}>
        {#each messages as message, index (message.id)}
          <div data-conversation-message-id={message.id}>
            <Message {message} {sessionId} {onOpenPreview} onOpenTranscript={openTranscript} isLast={index === messages.length - 1} />
          </div>
        {/each}

        {#if transcriptPanelOpen && remoteTranscripts.length > 0}
          <div class="mx-auto mt-3 w-full max-w-4xl px-4">
            <RemoteTranscriptTabs
              transcripts={remoteTranscripts}
              requestedTranscriptId={requestedTranscriptId}
              requestedTranscriptSequence={requestedTranscriptSequence}
              onClose={closeTranscriptTabs}
            />
          </div>
        {/if}

        {#if sessionId}
          <div data-conversation-message-id="conversation-prompt">
            <Approval {sessionId} />
            <ClarifyCard {sessionId} />
          </div>
        {/if}
      </div>
    {/if}
  </section>

  {#if showTimeline}
    <ConversationTimelineRail markers={timelineMarkers} onActivate={scrollToTimelineMarker} />
  {/if}
</div>
