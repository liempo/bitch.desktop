<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import ClarifyCard from '../prompts/ClarifyCard.svelte'
  import Message from './Message.svelte'
  import { messageState } from '$lib/stores/messages.svelte'

  interface Props {
    canCreate?: boolean
    onCreate?: () => void | Promise<unknown>
    sessionId?: null | string
  }

  let { canCreate = false, onCreate = () => undefined, sessionId = null }: Props = $props()

  let scrollElement: HTMLElement | null = $state(null)
  let stickToBottom = $state(true)
  let elapsed = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null

  const thread = $derived(sessionId ? (messageState.sessions[sessionId] ?? null) : null)
  const messages = $derived(thread?.messages ?? [])
  const busy = $derived(thread?.busy ?? false)

  const scrollSignature = $derived(
    messages
      .map(message =>
        [
          message.id,
          message.text,
          message.reasoning,
          message.pending ? 'pending' : 'done',
          message.error ?? '',
          message.tools.map(tool => `${tool.id}:${tool.status}:${tool.summary}:${tool.context ?? ''}:${tool.error ?? ''}`).join(',')
        ].join('|')
      )
      .join('\n')
  )

  // Elapsed timer while Hermes is working
  $effect(() => {
    if (busy) {
      elapsed = 0
      timerInterval = setInterval(() => (elapsed += 1), 1000)
    } else {
      if (timerInterval) clearInterval(timerInterval)
      timerInterval = null
    }
  })

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval)
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

  function handleCreate(): void {
    if (!canCreate) return
    void onCreate()
  }

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }
</script>

<section
  class="flex-1 overflow-y-auto"
  bind:this={scrollElement}
  onscroll={handleScroll}
  aria-label="Message thread"
>
  {#if !sessionId}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <div class="max-w-md text-center">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-primary/70">Remote Hermes client</p>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight text-ink">BITCH Desktop</h1>
        <p class="mt-3 text-sm leading-6 text-ink-muted">
          Select a session from the sidebar or start a new chat. The chrome is installed; the operator still has to feed it work.
        </p>
        <button
          class="mt-6 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:border-primary/60 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
          type="button"
          onclick={handleCreate}
          disabled={!canCreate}
        >
          New chat
        </button>
      </div>
    </div>
  {:else if thread?.loading && messages.length === 0}
    <div class="mx-auto w-full max-w-3xl space-y-4 px-4 py-8" aria-label="Loading transcript">
      <div class="h-20 animate-pulse rounded-2xl bg-surface-raised/70"></div>
      <div class="h-28 animate-pulse rounded-2xl bg-surface-raised/50"></div>
      <div class="h-20 animate-pulse rounded-2xl bg-surface-raised/70"></div>
    </div>
  {:else if thread?.error && messages.length === 0}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <div class="max-w-lg rounded-2xl border border-danger/30 bg-danger/10 p-5 text-sm leading-6 text-danger">
        <p class="font-semibold">Could not load the transcript.</p>
        <p class="mt-2 text-danger/80">{thread.error}</p>
      </div>
    </div>
  {:else if messages.length === 0}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <div class="max-w-md text-center">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-success/70">Session ready</p>
        <h2 class="mt-3 text-xl font-semibold tracking-tight text-ink">No messages yet</h2>
        <p class="mt-3 text-sm leading-6 text-ink-muted">
          History will appear here. Type in the composer below; the gateway will receive the message once the chromed courier lane is clear.
        </p>
      </div>
    </div>
  {:else}
    <div class="py-4">
      {#each messages as message (message.id)}
        <Message {message} />
      {/each}

      {#if sessionId}
        <ClarifyCard {sessionId} />
      {/if}

      {#if busy}
        <div
          class="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 text-xs text-ink-muted"
          aria-label="Hermes is working"
          role="status"
        >
          <span class="inline-block h-3 w-3 animate-pulse rounded-sm bg-ink-muted"></span>
          <span class="tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
      {/if}
    </div>
  {/if}
</section>
