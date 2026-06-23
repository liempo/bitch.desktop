<script lang="ts">
  import {
    clearPersonalGlyph,
    glyphState,
    loadGlyphList,
    requestGlyphGeneration,
    selectRemoteGlyphArtifact,
    syncRemoteGlyphArtifact,
    type GlyphListItem
  } from '$lib/hermes/glyph'
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import TextArea from '@/app/components/ui/TextArea.svelte'

  interface Props {
    open?: boolean
  }

  let { open = $bindable(false) }: Props = $props()
  let glyphPrompt = $state(glyphState.lastPrompt)
  let listLoadedForOpen = $state(false)

  const busy = $derived(glyphState.generating || glyphState.syncing)
  const canGenerate = $derived(Boolean(glyphPrompt.trim()) && !busy)
  const glyphListBusy = $derived(glyphState.glyphsLoading && glyphState.glyphs.length === 0)
  const glyphOptionBaseClass = [
    'grid w-full min-w-0 grid-cols-[1fr_auto] items-start gap-2 rounded-control border px-2 py-2 text-left font-mono',
    'hover:border-line-strong hover:bg-primary/10 focus-visible:border-line-strong focus-visible:bg-primary/10 focus-visible:outline-none'
  ].join(' ')

  $effect(() => {
    if (!open) {
      listLoadedForOpen = false
      return
    }

    if (listLoadedForOpen) return
    listLoadedForOpen = true
    void loadGlyphList()
  })

  async function generateGlyph(): Promise<void> {
    await requestGlyphGeneration(glyphPrompt)
  }

  async function syncCurrent(): Promise<void> {
    await syncRemoteGlyphArtifact()
    void loadGlyphList()
  }

  async function selectGlyph(glyphId: string): Promise<void> {
    await selectRemoteGlyphArtifact(glyphId)
  }

  function resetGlyph(): void {
    clearPersonalGlyph()
  }

  function glyphOptionClass(selected: boolean): string {
    return `${glyphOptionBaseClass} ${selected ? 'border-primary/50 bg-primary/15 text-ink-bright' : 'border-transparent text-ink'}`
  }

  function glyphMeta(glyph: GlyphListItem): string {
    const parts = [formatGlyphDate(glyph.createdAt), glyph.hasPreview ? 'preview' : 'scene only']
    return parts.filter(Boolean).join(' · ')
  }

  function formatGlyphDate(value: string | undefined): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString(undefined, { day: 'numeric', hour: '2-digit', minute: '2-digit', month: 'short' })
  }
</script>

<Dialog
  bind:open
  title="Edit GLYPH"
  description="generate a personal Threlte glyph through Hermes"
  class="w-[min(42rem,calc(100vw-2rem))]"
  contentClass="flex max-h-[min(42rem,calc(100vh-8rem))] flex-col gap-3 p-3"
>
  <div class="space-y-2">
    <label class="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted" for="glyph-prompt">
      glyph_prompt
    </label>
    <TextArea
      id="glyph-prompt"
      bind:value={glyphPrompt}
      rows={7}
      placeholder="Describe the glyph: e.g. obsidian fox sigil, thin orbital rings, memory core pulse..."
      disabled={busy}
    />
    <p class="text-[10px] leading-5 text-ink-muted">
      BITCH asks the bundled Hermes plugin to generate and persist the artifact through <code>/api/plugins/bitch/glyph/generate</code>. Saved glyphs come from <code>/api/plugins/bitch/glyph/list</code>, and selection syncs a validated artifact through <code>/api/plugins/bitch/glyph/current</code>.
    </p>
  </div>

  {#if glyphState.manifest}
    <div class="rounded-control border border-line bg-surface-raised/50 p-2 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
      Current glyph: <span class="text-ink-bright">{glyphState.manifest.name}</span>
      {#if glyphState.selectedGlyphId}
        <span class="normal-case tracking-normal text-ink-muted">({glyphState.selectedGlyphId})</span>
      {/if}
    </div>
  {/if}

  <div class="min-h-0 rounded-control border border-line bg-surface-raised/30 p-2">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Saved glyphs</div>
      <Button chrome="ghost" size="sm" onclick={() => void loadGlyphList()} disabled={busy || glyphState.glyphsLoading}>
        {#if glyphState.glyphsLoading}<Loader size="sm" label="Loading glyph list" />{/if}
        Refresh
      </Button>
    </div>

    {#if glyphListBusy}
      <div class="rounded-control border border-dotted border-line p-3 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
        Loading glyphs…
      </div>
    {:else if glyphState.glyphs.length === 0}
      <div class="rounded-control border border-dotted border-line p-3 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
        No generated glyphs found.
      </div>
    {:else}
      <div class="max-h-48 min-h-0 space-y-px overflow-y-auto" role="listbox" aria-label="Saved glyphs">
        {#each glyphState.glyphs as glyph (glyph.id)}
          {@const selected = glyphState.selectedGlyphId === glyph.id}
          {@const current = glyphState.currentGlyphId === glyph.id}
          {@const meta = glyphMeta(glyph)}
          <Button
            variant="unstyled"
            class={glyphOptionClass(selected)}
            onclick={() => void selectGlyph(glyph.id)}
            role="option"
            aria-selected={selected}
            aria-label={`Select ${glyph.name}`}
            disabled={busy}
          >
            <span class="min-w-0">
              <span class="block truncate text-[11px] font-semibold uppercase tracking-wider" title={glyph.name}>{glyph.name}</span>
              {#if glyph.prompt}
                <span class="mt-1 block truncate text-[10px] text-ink-muted/90" title={glyph.prompt}>{glyph.prompt}</span>
              {/if}
              {#if meta}
                <span class="mt-1 block truncate text-[10px] uppercase tracking-[0.12em] text-ink-muted/80">{meta}</span>
              {/if}
            </span>
            {#if selected}
              <span class="text-[10px] uppercase tracking-[0.12em] text-primary">selected</span>
            {:else if current}
              <span class="text-[10px] uppercase tracking-[0.12em] text-ink-muted">current</span>
            {/if}
          </Button>
        {/each}
      </div>
    {/if}
  </div>

  {#if glyphState.error}
    <div class="rounded-control border border-danger/40 bg-danger/10 p-2 text-[10px] leading-5 text-danger">
      {glyphState.error}
    </div>
  {:else if glyphState.notice}
    <div class="rounded-control border border-primary/35 bg-primary/10 p-2 text-[10px] leading-5 text-primary">
      {glyphState.notice}
    </div>
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
    <Button chrome="ghost" variant="danger" size="sm" onclick={resetGlyph} disabled={busy || !glyphState.scene}>
      Reset
    </Button>

    <div class="flex flex-wrap justify-end gap-2">
      <Button chrome="ghost" size="sm" onclick={() => void syncCurrent()} disabled={busy}>
        {#if glyphState.syncing}<Loader size="sm" label="Syncing glyph" />{/if}
        Sync current
      </Button>
      <Button variant="primary" size="sm" onclick={() => void generateGlyph()} disabled={!canGenerate}>
        {#if glyphState.generating}<Loader size="sm" label="Generating glyph" />{/if}
        Generate glyph
      </Button>
    </div>
  </div>
</Dialog>
