<script lang="ts">
  import { ContextMenu } from 'bits-ui'
  import type { Snippet } from 'svelte'
  import Button from '@/components/ui/Button.svelte'
  import Dialog from '@/components/ui/Dialog.svelte'
  import { menuItemClass, popoverClass } from '@/components/ui/styles'
  import type { SessionInfo } from '$lib/types/hermes'

  interface Props {
    children: Snippet
    disabled?: boolean
    onArchive: () => void | Promise<unknown>
    onDelete: () => void | Promise<unknown>
    onRename: (title: string) => void | Promise<unknown>
    onTogglePin: () => void | Promise<unknown>
    pinned?: boolean
    session: SessionInfo
  }

  let {
    children,
    disabled = false,
    onArchive,
    onDelete,
    onRename,
    onTogglePin,
    pinned = false,
    session
  }: Props = $props()

  let renameOpen = $state(false)
  let renameDraft = $state('')
  let renameError = $state<string | null>(null)
  let renameSubmitting = $state(false)

  function currentTitle(): string {
    return session.title?.trim() || 'Untitled session'
  }

  function openRenameDialog(): void {
    renameDraft = currentTitle()
    renameError = null
    renameOpen = true
  }

  async function submitRename(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const trimmed = renameDraft.trim()

    if (!trimmed) {
      renameError = 'Title is required.'
      return
    }

    renameSubmitting = true
    renameError = null

    try {
      const result = await onRename(trimmed)
      if (result === false) {
        renameError = 'Rename failed. Check the session error banner for details.'
        return
      }
      renameOpen = false
    } catch (error) {
      renameError = error instanceof Error ? error.message : 'Rename failed.'
    } finally {
      renameSubmitting = false
    }
  }

  function handleDelete(): void {
    if (window.confirm(`Delete “${currentTitle()}”? This cannot be undone.`)) {
      void onDelete()
    }
  }

  const itemClass =
    `${menuItemClass} grid grid-cols-[1fr_auto] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]`

  const dangerItemClass = `${itemClass} text-danger hover:bg-danger/10`
  const contentClass = `${popoverClass} z-50 min-w-58 p-1.5 font-mono`
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="block" {disabled}>
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content
    class={contentClass}
    sideOffset={4}
  >
    <ContextMenu.Item
      class={itemClass}
      onSelect={openRenameDialog}
    >
      <span>rename</span>
      <span class="text-[10px] text-ink-muted">mv</span>
    </ContextMenu.Item>

    <ContextMenu.Item
      class={itemClass}
      onSelect={() => void onTogglePin()}
    >
      {pinned ? 'Unpin' : 'Pin'}
      <span class="text-[10px] text-ink-muted">{pinned ? 'unset' : 'set'}</span>
    </ContextMenu.Item>

    <ContextMenu.Separator class="mx-2 my-1 border-t border-dotted border-line-strong" />

    <ContextMenu.Item
      class={itemClass}
      onSelect={() => void onArchive()}
    >
      <span>archive</span>
      <span class="text-[10px] text-ink-muted">tar</span>
    </ContextMenu.Item>

    <ContextMenu.Item
      class={dangerItemClass}
      onSelect={handleDelete}
    >
      <span>delete</span>
      <span class="text-[10px] text-danger/80">rm</span>
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>

<Dialog
  bind:open={renameOpen}
  title="Rename Session"
  description="assign a stable sidebar label"
  class="w-[min(26rem,calc(100vw-2rem))]"
  contentClass="p-3"
>
  <form class="grid gap-3" onsubmit={submitRename}>
    <label class="grid gap-1 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
      <span>title</span>
      <input
        bind:value={renameDraft}
        class="rounded-control border border-line bg-surface px-2 py-2 font-mono text-[12px] text-ink-bright outline-none focus:border-primary/70"
        disabled={renameSubmitting || disabled}
        maxlength="160"
      />
    </label>

    {#if renameError}
      <p class="text-[11px] text-danger">{renameError}</p>
    {/if}

    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        type="button"
        onclick={() => (renameOpen = false)}
        disabled={renameSubmitting}
      >
        cancel
      </Button>
      <Button
        variant="primary"
        type="submit"
        disabled={renameSubmitting || disabled || !renameDraft.trim()}
      >
        {renameSubmitting ? 'renaming…' : 'rename'}
      </Button>
    </div>
  </form>
</Dialog>
