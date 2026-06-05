<script lang="ts">
  import { tick } from 'svelte'
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

  const thread = $derived(sessionId ? (messageState.sessions[sessionId] ?? null) : null)
  const messages = $derived(thread?.messages ?? [])
  const scrollSignature = $derived(
    messages
      .map(message =>
        [
          message.id,
          message.text,
          message.reasoning,
          message.pending ? 'pending' : 'done',
          message.error ?? '',
          message.tools.map(tool => `${tool.id}:${tool.status}:${tool.summary}:${tool.error ?? ''}`).join(',')
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

  function handleCreate(): void {
    if (!canCreate) return
    void onCreate()
  }
</script>

<section
  class="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_36rem)]"
  bind:this={scrollElement}
  onscroll={handleScroll}
  aria-label="Message thread"
>
  {#if !sessionId}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <div class="max-w-md text-center">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-sky-500/70">Remote Hermes client</p>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight text-slate-200">BITCH Desktop</h1>
        <p class="mt-3 text-sm leading-6 text-slate-500">
          Select a session from the sidebar or start a new chat. The chrome is installed; the operator still has to feed it work.
        </p>
        <button
          class="mt-6 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:border-sky-300/60 hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-40"
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
      <div class="h-20 animate-pulse rounded-2xl bg-slate-900/70"></div>
      <div class="h-28 animate-pulse rounded-2xl bg-slate-900/50"></div>
      <div class="h-20 animate-pulse rounded-2xl bg-slate-900/70"></div>
    </div>
  {:else if thread?.error && messages.length === 0}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <div class="max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200">
        <p class="font-semibold">Could not load the transcript.</p>
        <p class="mt-2 text-red-200/80">{thread.error}</p>
      </div>
    </div>
  {:else if messages.length === 0}
    <div class="flex min-h-full items-center justify-center px-6 py-16">
      <div class="max-w-md text-center">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-emerald-500/70">Session ready</p>
        <h2 class="mt-3 text-xl font-semibold tracking-tight text-slate-200">No messages yet</h2>
        <p class="mt-3 text-sm leading-6 text-slate-500">
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

      {#if thread?.busy}
        <div class="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 text-xs text-slate-500">
          <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
          <span>Hermes is working…</span>
        </div>
      {/if}
    </div>
  {/if}
</section>
