<script lang="ts">
  import { clearPersonalGlyph, glyphState, requestGlyphGeneration, syncRemoteGlyphArtifact } from '$lib/hermes/glyph'
  import { sessionState } from '$lib/hermes/sessions'
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import TextArea from '@/app/components/ui/TextArea.svelte'

  interface Props {
    open?: boolean
  }

  let { open = $bindable(false) }: Props = $props()
  let glyphPrompt = $state(glyphState.lastPrompt)

  const busy = $derived(glyphState.generating || glyphState.syncing)
  const canSend = $derived(Boolean(glyphPrompt.trim()) && !busy)

  async function sendGlyphSkill(): Promise<void> {
    const ok = await requestGlyphGeneration(glyphPrompt, { sessionId: sessionState.storedSessionId })
    if (ok) open = false
  }

  async function syncLatest(): Promise<void> {
    await syncRemoteGlyphArtifact()
  }

  function resetGlyph(): void {
    clearPersonalGlyph()
  }
</script>

<Dialog
  bind:open
  title="Edit GLYPH"
  description="generate a personal Threlte glyph through Hermes"
  class="w-[min(38rem,calc(100vw-2rem))]"
  contentClass="space-y-3 p-3"
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
      BITCH sends a constrained skill prompt to Hermes. The agent writes <code>$HERMES_HOME/bitch/glyph</code>, then Sync latest pulls the validated artifact through <code>/api/plugins/bitch/glyph/current</code>.
    </p>
  </div>

  {#if glyphState.manifest}
    <div class="rounded-control border border-line bg-surface-raised/50 p-2 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
      Current glyph: <span class="text-ink-bright">{glyphState.manifest.name}</span>
    </div>
  {/if}

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
      <Button chrome="ghost" size="sm" onclick={() => void syncLatest()} disabled={busy}>
        {#if glyphState.syncing}<Loader size="sm" label="Syncing glyph" />{/if}
        Sync latest
      </Button>
      <Button variant="primary" size="sm" onclick={() => void sendGlyphSkill()} disabled={!canSend}>
        {#if glyphState.generating}<Loader size="sm" label="Sending glyph skill" />{/if}
        Send to AGENT
      </Button>
    </div>
  </div>
</Dialog>
