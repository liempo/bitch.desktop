<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import {
    previewFromRemoteFilePath,
    type ConversationPreview,
    type DiffCard,
    type DiffCardFile,
    type DiffCardLine,
    type DiffFileChangeKind
  } from '$lib/hermes/conversations'

  interface Props {
    card: DiffCard
    onOpenPreview?: (preview: ConversationPreview) => void
    profile?: null | string
  }

  let { card, onOpenPreview, profile = null }: Props = $props()
  let collapsedById: Record<string, boolean> = $state({})
  let copiedFileId: null | string = $state(null)

  const totalAdditions = $derived(card.files.reduce((sum, file) => sum + file.additions, 0))
  const totalDeletions = $derived(card.files.reduce((sum, file) => sum + file.deletions, 0))

  function isCollapsed(file: DiffCardFile): boolean {
    return Boolean(collapsedById[file.id])
  }

  function toggleFile(file: DiffCardFile): void {
    collapsedById = { ...collapsedById, [file.id]: !isCollapsed(file) }
  }

  async function copyPatch(file: DiffCardFile): Promise<void> {
    if (!navigator.clipboard?.writeText) return
    copiedFileId = file.id
    await navigator.clipboard.writeText(file.rawText)
  }

  function openRemoteFile(file: DiffCardFile): void {
    if (!file.absolutePath || !onOpenPreview) return
    const preview = previewFromRemoteFilePath(file.absolutePath, file.absolutePath, profile)
    if (preview) onOpenPreview(preview)
  }

  function statusLabel(kind: DiffFileChangeKind): string {
    if (kind === 'added') return 'Added'
    if (kind === 'deleted') return 'Deleted'
    if (kind === 'renamed') return 'Renamed'
    if (kind === 'binary') return 'Binary'
    if (kind === 'unknown') return 'Changed'
    return 'Modified'
  }

  function statusClass(kind: DiffFileChangeKind): string {
    if (kind === 'added') return 'border-success/40 text-success'
    if (kind === 'deleted') return 'border-danger/40 text-danger'
    if (kind === 'renamed') return 'border-secondary/45 text-secondary'
    if (kind === 'binary') return 'border-warning/45 text-warning'
    return 'border-primary/45 text-primary'
  }

  function lineClass(line: DiffCardLine): string {
    if (line.kind === 'add') return 'border-success/20 bg-success/10 text-success'
    if (line.kind === 'delete') return 'border-danger/20 bg-danger/10 text-danger'
    if (line.kind === 'meta') return 'border-warning/20 bg-warning/5 text-warning'
    return 'border-transparent text-ink'
  }

  function linePrefix(line: DiffCardLine): string {
    if (line.kind === 'add') return '+'
    if (line.kind === 'delete') return '-'
    return ' '
  }

  function lineNumber(value: null | number): string {
    return value === null ? '' : String(value)
  }

  function lineBody(line: DiffCardLine): string {
    if (line.kind === 'meta') return line.content
    return line.content.slice(1)
  }
</script>

{#if card.files.length > 0}
  <section class="my-3 space-y-2" data-diff-card>
    <div class="flex flex-wrap items-center gap-2 font-hud text-[0.62rem] uppercase tracking-[0.16em] text-ink-muted">
      <span class="text-primary">Patch</span>
      <span>{card.files.length} {card.files.length === 1 ? 'file' : 'files'}</span>
      <span class="text-success">+{totalAdditions}</span>
      <span class="text-danger">-{totalDeletions}</span>
    </div>

    {#each card.files as file (file.id)}
      {@const collapsed = isCollapsed(file)}
      {@const copied = copiedFileId === file.id}
      <article class={`${cardClass} overflow-hidden text-xs`} data-diff-file={file.displayPath}>
        <header class="flex min-w-0 flex-wrap items-center gap-2 border-b border-line/60 bg-surface/70 px-3 py-2">
          <button
            type="button"
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-line bg-surface-raised font-hud text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
            aria-label={collapsed ? `Expand diff for ${file.displayPath}` : `Collapse diff for ${file.displayPath}`}
            aria-expanded={!collapsed}
            onclick={() => toggleFile(file)}
          >
            {collapsed ? '›' : '⌄'}
          </button>

          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <span class={`shrink-0 rounded-control border px-1.5 py-0.5 font-hud text-[0.58rem] uppercase tracking-[0.14em] ${statusClass(file.changeKind)}`}>
                {statusLabel(file.changeKind)}
              </span>
              <span class="truncate font-mono text-[0.78rem] text-ink-bright" title={file.displayPath}>{file.displayPath}</span>
            </div>
            {#if file.oldPath && file.newPath && file.oldPath !== file.newPath && file.oldPath !== '/dev/null' && file.newPath !== '/dev/null'}
              <p class="mt-1 truncate font-mono text-[0.68rem] text-ink-muted" title={`${file.oldPath} → ${file.newPath}`}>
                {file.oldPath} → {file.newPath}
              </p>
            {/if}
          </div>

          <span class="shrink-0 font-mono text-[0.68rem] text-success">+{file.additions}</span>
          <span class="shrink-0 font-mono text-[0.68rem] text-danger">-{file.deletions}</span>

          {#if file.absolutePath && onOpenPreview}
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Open remote file for ${file.absolutePath}`}
              onclick={() => openRemoteFile(file)}
            >
              Open file
            </Button>
          {/if}

          <Button
            size="sm"
            variant={copied ? 'success' : 'default'}
            aria-label={copied ? `Copied patch for ${file.displayPath}` : `Copy patch for ${file.displayPath}`}
            onclick={() => copyPatch(file)}
          >
            {copied ? 'Copied' : 'Copy patch'}
          </Button>
        </header>

        {#if !collapsed}
          <div class="overflow-x-auto bg-canvas/70" data-diff-file-body={file.displayPath}>
            {#if file.metaLines.length > 0}
              <div class="border-b border-line/40 px-3 py-1.5 font-mono text-[0.68rem] leading-5 text-ink-muted">
                {#each file.metaLines as metaLine}
                  <div>{metaLine}</div>
                {/each}
              </div>
            {/if}

            {#if file.hunks.length > 0}
              {#each file.hunks as hunk}
                <div class="border-y border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[0.7rem] leading-5 text-primary">
                  {hunk.header}
                </div>
                <div class="font-mono text-[0.72rem] leading-5">
                  {#each hunk.lines as line}
                    <div class={`grid min-w-max grid-cols-[3rem_3rem_1.25rem_minmax(0,1fr)] border-l-2 ${lineClass(line)}`}>
                      <span class="select-none border-r border-line/40 px-2 text-right text-ink-muted/60">{lineNumber(line.oldLine)}</span>
                      <span class="select-none border-r border-line/40 px-2 text-right text-ink-muted/60">{lineNumber(line.newLine)}</span>
                      <span class="select-none px-1 text-center text-ink-muted/70">{linePrefix(line)}</span>
                      <code class="whitespace-pre px-2 text-inherit">{lineBody(line)}</code>
                    </div>
                  {/each}
                </div>
              {/each}
            {:else if file.metaLines.length === 0}
              <div class="px-3 py-3 text-sm text-ink-muted">No textual hunks in this file change.</div>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
  </section>
{/if}
