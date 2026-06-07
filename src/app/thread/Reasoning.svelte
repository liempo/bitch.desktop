<script lang="ts">
  import { onDestroy } from 'svelte'

  interface Props {
    pending?: boolean
    text: string
  }

  let { pending = false, text }: Props = $props()

  // Auto-open while streaming, auto-collapse when done.
  // First explicit user toggle wins from then on.
  let userOpen: boolean | null = $state(null)
  let elapsed = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null

  const open = $derived(userOpen ?? pending)
  const isPreview = $derived(pending && userOpen === null)

  // Elapsed timer — ticks every second while pending
  $effect(() => {
    if (pending) {
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

  function toggle(): void {
    userOpen = !open
  }

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }
</script>

{#if text.trim() || pending}
  <div class="py-1.5 text-xs text-ink-muted" data-slot="thinking-disclosure">
    <!-- Disclosure header -->
    <button
      class="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-raised/50"
      onclick={toggle}
      type="button"
      aria-expanded={open}
    >
      <span class="flex min-w-0 items-center gap-2">
        {#if pending}
          <span
            class="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success"
            aria-hidden="true"
          ></span>
          <span class="text-sm text-ink-muted">Thinking…</span>
        {:else}
          {#if text.trim()}
            <svg
              class="h-3 w-3 shrink-0 text-ink-muted/70 transition-transform {open ? 'rotate-90' : ''}"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          {/if}
          <span class="font-medium uppercase tracking-[0.14em] text-ink-muted">Thinking</span>
        {/if}
      </span>
      {#if pending}
        <span class="shrink-0 tabular-nums text-[0.65rem] text-ink-muted/70">{formatElapsed(elapsed)}</span>
      {/if}
    </button>

    <!-- Disclosure body -->
    {#if open && text.trim()}
      <div
        class="mt-0.5 max-h-40 w-full overflow-auto {isPreview
          ? 'mask-b-from-80%'
          : ''} pb-1"
      >
        <div class="whitespace-pre-wrap wrap-break-word px-1 leading-5 text-ink-muted/80">
          {text}
        </div>
      </div>
    {/if}
  </div>
{/if}
