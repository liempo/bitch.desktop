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
  <div class="text-xs text-slate-500" data-slot="thinking-disclosure">
    <!-- Disclosure header -->
    <button
      class="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-slate-800/50"
      onclick={toggle}
      type="button"
      aria-expanded={open}
    >
      <svg
        class="h-3 w-3 shrink-0 text-slate-600 transition-transform {open ? 'rotate-90' : ''}"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      <span
        class="font-medium uppercase tracking-[0.14em] text-slate-400 {pending
          ? 'animate-pulse'
          : ''}"
      >
        Thinking
      </span>
      {#if pending}
        <span class="tabular-nums text-[0.65rem] text-slate-600">{formatElapsed(elapsed)}</span>
      {/if}
    </button>

    <!-- Disclosure body -->
    {#if open && text.trim()}
      <div
        class="mt-0.5 max-h-40 w-full overflow-auto {isPreview
          ? 'mask-b-from-80%'
          : ''} pb-1"
      >
        <div class="whitespace-pre-wrap wrap-break-word px-1 leading-5 text-slate-500/80">
          {text}
        </div>
      </div>
    {/if}
  </div>
{/if}
