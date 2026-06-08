<script lang="ts">
  import { ContextMenu } from 'bits-ui'
  import type { Snippet } from 'svelte'
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

  function currentTitle(): string {
    return session.title?.trim() || 'Untitled session'
  }

  function handleRename(): void {
    const nextTitle = window.prompt('Rename session', currentTitle())

    if (nextTitle?.trim()) {
      void onRename(nextTitle.trim())
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
      onSelect={handleRename}
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
