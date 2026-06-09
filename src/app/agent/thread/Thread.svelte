<script lang="ts">
  import { tick } from 'svelte'
  import Approval from '../prompts/Approval.svelte'
  import ClarifyCard from '../prompts/ClarifyCard.svelte'
  import Loader from '@/components/ui/Loader.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import Message from './Message.svelte'
  import { messageState } from '$lib/stores/messages.svelte'
  import { sessionState } from '$lib/stores/session.svelte'

  interface Props {
    sessionId?: null | string
  }

  let { sessionId = null }: Props = $props()

  let scrollElement: HTMLElement | null = $state(null)
  let stickToBottom = $state(true)

  const thread = $derived(sessionId ? (messageState.sessions[sessionId] ?? null) : null)
  const messages = $derived(thread?.messages ?? [])
  const loadingSession = $derived(
    Boolean(sessionId) &&
      messages.length === 0 &&
      (thread?.loading || sessionState.resumingSessionId === sessionId)
  )

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


</script>

<section
  class="flex-1 overflow-y-auto bg-chat-scroll/40"
  data-selectable="true"
  bind:this={scrollElement}
  onscroll={handleScroll}
  aria-label="Message thread"
>
  {#if !sessionId}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <Panel title="Remote Hermes Client" titleClass="text-primary" class="max-w-lg" contentClass="p-6 text-center" padded={false} fullHeight={false}>
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-secondary">awaiting_route</p>
        <h1 class="mt-3 text-2xl font-semibold tracking-[0.08em] text-ink-bright">BITCH</h1>
        <p class="mt-3 text-sm leading-6 text-ink-muted">
          Select a session from the index. The chrome is installed; the operator still has to feed it work.
        </p>
      </Panel>
    </div>
  {:else if loadingSession}
    <div class="flex min-h-full items-center justify-center px-6 py-16" aria-label="Loading session" role="status">
      <Panel title="Hydrating Transcript" titleClass="text-primary" contentClass="flex flex-col items-center gap-3 p-5 text-center" padded={false} fullHeight={false}>
        <Loader size="lg" />
        <p class="text-xs uppercase tracking-[0.16em] text-ink-muted">loading session history</p>
      </Panel>
    </div>
  {:else if thread?.error && messages.length === 0}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <Panel title="Transcript Error" titleClass="text-danger" class="max-w-lg border-danger/40 !bg-danger/10" contentClass="p-5 text-sm leading-6 text-danger" padded={false} fullHeight={false}>
        <p class="font-semibold uppercase tracking-[0.12em]">Could not load the transcript.</p>
        <p class="mt-2 text-danger/80">{thread.error}</p>
      </Panel>
    </div>
  {:else if messages.length === 0}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <Panel title="Empty Buffer" titleClass="text-secondary" class="max-w-md" contentClass="p-5 text-center" padded={false} fullHeight={false}>
        <h2 class="text-xl font-semibold tracking-[0.08em] text-ink-bright">No messages yet</h2>
        <p class="mt-3 text-sm leading-6 text-ink-muted">
          History will appear here. Type in the composer below; the gateway will receive the message once the chromed courier lane is clear.
        </p>
      </Panel>
    </div>
  {:else}
    <div class="py-4">
      {#each messages as message (message.id)}
        <Message {message} {sessionId} />
      {/each}

      {#if sessionId}
        <Approval {sessionId} />
        <ClarifyCard {sessionId} />
      {/if}
    </div>
  {/if}
</section>
