<script lang="ts">
  import { cardClass } from '@/app/components/ui/styles'

  interface Props {
    lastInThread?: boolean
    text: string
  }

  let { lastInThread = false, text }: Props = $props()

  let userOpen: boolean | null = $state(null)

  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
  const systemCardClass = `${cardClass} my-1.5 overflow-hidden border-dashed border-line text-xs text-ink-muted`
  const parsed = $derived(parseSystemText(text))
  const hasBody = $derived(Boolean(parsed.body))
  const autoOpen = $derived(lastInThread && hasBody)
  const open = $derived(userOpen ?? autoOpen)

  function toggle(): void {
    if (hasBody) userOpen = !open
  }

  function parseSystemText(value: string): { body: string; context: string } {
    const normalized = stripAnsi(value).trim()
    const [firstLine = '', ...rest] = normalized.split(/\r?\n/)
    const body = rest.join('\n').trim()

    if (!body) {
      return { body: normalized, context: '' }
    }

    return {
      body,
      context: firstLine.trim()
    }
  }

  function stripAnsi(value: string): string {
    return value.replace(ansiPattern, '')
  }
</script>

{#if parsed.body || parsed.context}
  <div class={systemCardClass} data-slot="system-message">
    <button
      class="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left {hasBody
        ? 'cursor-pointer'
        : 'cursor-default'}"
      onclick={toggle}
      type="button"
      disabled={!hasBody}
      aria-expanded={hasBody ? open : undefined}
    >
      {#if hasBody}
        <svg
          class="h-3 w-3 shrink-0 text-ink-muted/70 {open ? 'rotate-90' : ''}"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      {/if}

      <span class="min-w-0 flex-1">
        <span class="flex min-w-0 items-baseline gap-1.5">
        <span class="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-secondary">System</span>
        {#if parsed.context}
          <span class="truncate text-ink-muted">· {parsed.context}</span>
        {/if}
        </span>
      </span>
    </button>

    {#if open && parsed.body}
      <div class="border-t border-line/50 px-3 py-2">
        <div class="whitespace-pre-wrap wrap-break-word leading-5 text-ink-muted/85">{parsed.body}</div>
      </div>
    {/if}
  </div>
{/if}
