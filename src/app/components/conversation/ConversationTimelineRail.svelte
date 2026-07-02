<script lang="ts">
  import type { ConversationTimelineMarker, ConversationTimelineMarkerKind } from '$lib/hermes/conversations'

  interface Props {
    markers: ConversationTimelineMarker[]
    onActivate?: (marker: ConversationTimelineMarker) => void
  }

  let { markers, onActivate }: Props = $props()
  let railElement: HTMLElement | null = $state(null)

  const BASE_MARKER_CLASS = [
    'flex h-6 w-6 items-center justify-center rounded-full border text-[0.62rem] font-bold uppercase leading-none',
    'bg-surface-raised/85 shadow-sm transition-colors',
    'hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
  ].join(' ')

  const MARKER_TONE_CLASSES: Record<ConversationTimelineMarkerKind, string> = {
    approval: 'border-warning/60 text-warning hover:bg-warning/15',
    assistant: 'border-secondary/55 text-secondary hover:bg-secondary/15',
    clarify: 'border-warning/60 text-warning hover:bg-warning/15',
    error: 'border-danger/70 text-danger hover:bg-danger/15',
    input: 'border-warning/60 text-warning hover:bg-warning/15',
    media: 'border-success/55 text-success hover:bg-success/15',
    'tool-heavy': 'border-primary/60 text-primary hover:bg-primary/15',
    user: 'border-warning/50 text-warning hover:bg-warning/15'
  }

  function markerGlyph(kind: ConversationTimelineMarkerKind): string {
    if (kind === 'assistant') return 'A'
    if (kind === 'tool-heavy') return 'T'
    if (kind === 'error') return '!'
    if (kind === 'approval') return '✓'
    if (kind === 'clarify' || kind === 'input') return '?'
    if (kind === 'media') return 'F'
    return 'U'
  }

  function markerClass(kind: ConversationTimelineMarkerKind): string {
    return `${BASE_MARKER_CLASS} ${MARKER_TONE_CLASSES[kind]}`
  }

  function markerAriaLabel(marker: ConversationTimelineMarker): string {
    return marker.description ? `${marker.label}: ${marker.description}` : marker.label
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(railElement?.querySelectorAll<HTMLButtonElement>('button[data-timeline-marker]') ?? [])
  }

  function focusMarker(markerId: string, nextIndexFor: (currentIndex: number, count: number) => number): void {
    const markerButtons = buttons()
    const currentIndex = markerButtons.findIndex(button => button.dataset.timelineMarker === markerId)
    if (currentIndex < 0) return

    const nextIndex = nextIndexFor(currentIndex, markerButtons.length)
    markerButtons[nextIndex]?.focus()
  }

  function handleMarkerKeydown(event: KeyboardEvent, markerId: string): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusMarker(markerId, (current, count) => Math.min(current + 1, count - 1))
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      focusMarker(markerId, current => Math.max(current - 1, 0))
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusMarker(markerId, () => 0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusMarker(markerId, (_current, count) => count - 1)
    }
  }

  function activate(marker: ConversationTimelineMarker): void {
    onActivate?.(marker)
  }
</script>

<nav
  bind:this={railElement}
  aria-label="Conversation timeline"
  class="hidden w-10 shrink-0 border-l border-line/70 bg-surface/50 px-1 py-2 md:flex"
>
  <div class="flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto rounded-control border border-line bg-canvas/40 py-1">
    {#each markers as marker (marker.id)}
      <button
        aria-label={markerAriaLabel(marker)}
        class={markerClass(marker.kind)}
        data-timeline-kind={marker.kind}
        data-timeline-marker={marker.id}
        onclick={() => activate(marker)}
        onkeydown={event => handleMarkerKeydown(event, marker.id)}
        title={markerAriaLabel(marker)}
        type="button"
      >
        <span aria-hidden="true">{markerGlyph(marker.kind)}</span>
      </button>
    {/each}
  </div>
</nav>
