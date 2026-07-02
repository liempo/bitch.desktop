<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import TerminalBlock from '@/app/components/ui/TerminalBlock.svelte'
  import type { RemoteToolTranscript } from '$lib/hermes/conversations'

  interface Props {
    onClose?: () => void
    requestedTranscriptId?: null | string
    requestedTranscriptSequence?: number
    transcripts: RemoteToolTranscript[]
  }

  let { onClose, requestedTranscriptId = null, requestedTranscriptSequence = 0, transcripts }: Props = $props()

  let selectedId = $state<string | null>(null)
  let lastAppliedRequestSequence = $state<number | null>(null)
  let copyStatus = $state<'copied' | 'failed' | null>(null)

  const selectedTranscript = $derived(transcripts.find(transcript => transcript.id === selectedId) ?? transcripts[0] ?? null)

  $effect(() => {
    const availableIds = transcripts.map(transcript => transcript.id)

    if (
      requestedTranscriptId &&
      requestedTranscriptSequence !== lastAppliedRequestSequence &&
      availableIds.includes(requestedTranscriptId)
    ) {
      selectedId = requestedTranscriptId
      lastAppliedRequestSequence = requestedTranscriptSequence
      copyStatus = null
      return
    }

    if (selectedId && availableIds.includes(selectedId)) return

    selectedId = availableIds[0] ?? null
    copyStatus = null
  })

  function domId(value: string, suffix: string): string {
    return `remote-transcript-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}-${suffix}`
  }

  function selectTranscript(id: string): void {
    selectedId = id
    copyStatus = null
  }

  async function copyTranscript(transcript: RemoteToolTranscript): Promise<void> {
    try {
      await navigator.clipboard.writeText(transcript.copyText)
      copyStatus = 'copied'
    } catch {
      copyStatus = 'failed'
    }
  }

  function metadataFor(transcript: RemoteToolTranscript): string {
    const parts = [
      transcript.status === 'running' ? 'RUNNING' : 'COMPLETE',
      transcript.exitStatus !== undefined ? `EXIT ${transcript.exitStatus}` : '',
      transcript.startedAt ? `START ${formatTimestamp(transcript.startedAt)}` : '',
      transcript.completedAt ? `END ${formatTimestamp(transcript.completedAt)}` : ''
    ].filter(Boolean)

    return parts.join(' · ')
  }

  function formatTimestamp(value: number): string {
    const millis = value < 1_000_000_000_000 ? value * 1000 : value
    const date = new Date(millis)

    if (Number.isNaN(date.getTime())) return String(value)

    return date.toLocaleString(undefined, {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short'
    })
  }
</script>

{#if transcripts.length > 0}
  <Panel
    title="Remote Transcripts"
    badge={String(transcripts.length)}
    class="min-h-64 border-primary/30 bg-surface/95"
    contentClass="flex min-h-0 flex-col gap-3 p-3"
    fullHeight={false}
    padded={false}
  >
    {#snippet actions()}
      {#if onClose}
        <Button size="sm" variant="secondary" onclick={onClose} aria-label="Close transcript tabs">
          Close
        </Button>
      {/if}
    {/snippet}

    <div
      class="flex min-w-0 gap-1 overflow-x-auto border-b border-line/60 pb-2"
      role="tablist"
      aria-label="Remote tool transcripts"
    >
      {#each transcripts as transcript (transcript.id)}
        <Button
          id={domId(transcript.id, 'tab')}
          role="tab"
          aria-selected={selectedTranscript?.id === transcript.id}
          aria-controls={domId(transcript.id, 'panel')}
          class="shrink-0 {selectedTranscript?.id === transcript.id ? 'border-primary/70 text-primary' : ''}"
          size="sm"
          variant="default"
          onclick={() => selectTranscript(transcript.id)}
        >
          {transcript.title}
        </Button>
      {/each}
    </div>

    {#if selectedTranscript}
      <div
        id={domId(selectedTranscript.id, 'panel')}
        role="tabpanel"
        aria-labelledby={domId(selectedTranscript.id, 'tab')}
        tabindex="0"
        class="flex min-h-0 flex-col gap-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-ink-muted">
          <span class="min-w-0 truncate">{metadataFor(selectedTranscript)}</span>
          <Button size="sm" variant="secondary" onclick={() => copyTranscript(selectedTranscript)}>
            Copy transcript
          </Button>
        </div>

        {#if copyStatus === 'copied'}
          <p class="text-[0.68rem] uppercase tracking-[0.12em] text-success" role="status">Copied full transcript</p>
        {:else if copyStatus === 'failed'}
          <p class="text-[0.68rem] uppercase tracking-[0.12em] text-danger" role="status">Clipboard unavailable</p>
        {/if}

        {#if selectedTranscript.clippedLineCount > 0}
          <p class="text-xs leading-5 text-ink-muted">
            Showing last {selectedTranscript.visibleLineCount} of {selectedTranscript.totalLineCount} lines; copy keeps the full scrollback.
          </p>
        {/if}

        <TerminalBlock class="max-h-96 min-h-36 overflow-auto whitespace-pre-wrap px-3 py-2 text-[0.72rem] leading-5 text-ink">{selectedTranscript.visibleText || '(no remote output yet)'}</TerminalBlock>
      </div>
    {/if}
  </Panel>
{/if}
