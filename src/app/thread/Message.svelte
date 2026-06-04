<script lang="ts">
  import Markdown from './Markdown.svelte'
  import Reasoning from './Reasoning.svelte'
  import ToolRow from './ToolRow.svelte'
  import type { ThreadMessage } from '$lib/stores/messages.svelte'

  interface Props {
    message: ThreadMessage
  }

  let { message }: Props = $props()

  const assistant = $derived(message.role === 'assistant')
  const user = $derived(message.role === 'user')
  const system = $derived(message.role === 'system')
  const label = $derived(user ? 'You' : assistant ? 'Hermes' : system ? 'System' : 'Tool')
  const timestamp = $derived(formatTimestamp(message.timestamp))

  function formatTimestamp(timestamp: number | undefined): string {
    if (!timestamp) return ''

    const millis = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
    return new Date(millis).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
</script>

{#if message.role === 'tool'}
  <div class="mx-auto w-full max-w-3xl px-4">
    {#each message.tools as tool (tool.id)}
      <ToolRow {tool} />
    {/each}
  </div>
{:else}
  <article class="mx-auto flex w-full max-w-3xl gap-3 px-4 py-3">
    <div
      class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold uppercase ${
        user
          ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
          : assistant
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            : 'border-slate-700 bg-slate-900 text-slate-400'
      }`}
      aria-hidden="true"
    >
      {user ? 'U' : assistant ? 'H' : 'S'}
    </div>

    <div class="min-w-0 flex-1">
      <div class="mb-1 flex items-center gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</h3>
        {#if timestamp}
          <time class="text-[0.65rem] text-slate-700">{timestamp}</time>
        {/if}
        {#if message.pending}
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-label="Streaming"></span>
        {/if}
      </div>

      {#if assistant && message.reasoning}
        <Reasoning text={message.reasoning} />
      {/if}

      {#if assistant}
        {#if message.text}
          <Markdown text={message.text} streaming={message.pending ?? false} />
        {:else if message.pending && !message.error}
          <div class="flex items-center gap-2 text-sm text-slate-500">
            <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
            <span>Thinking…</span>
          </div>
        {/if}
      {:else}
        <p class="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-slate-200">{message.text}</p>
      {/if}

      {#if message.tools.length > 0}
        <div class="mt-2">
          {#each message.tools as tool (tool.id)}
            <ToolRow {tool} />
          {/each}
        </div>
      {/if}

      {#if message.error}
        <div class="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm leading-6 text-red-200">
          {message.error}
        </div>
      {/if}
    </div>
  </article>
{/if}
