<script lang="ts">
  import { ContextMenu } from 'bits-ui'
  import type { Snippet } from 'svelte'
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
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="block" {disabled}>
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Content
    class="cli-popover z-50 min-w-40 p-1.5 backdrop-blur-lg"
    sideOffset={4}
  >
    <ContextMenu.Item
      class="cli-menu-item px-3 py-1.5 text-xs font-medium"
      onSelect={handleRename}
    >
      <svg class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828z" />
      </svg>
      Rename
    </ContextMenu.Item>

    <ContextMenu.Item
      class="cli-menu-item px-3 py-1.5 text-xs font-medium"
      onSelect={() => void onTogglePin()}
    >
      <svg class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 4v12l-4 2-4-2V4M6 4h12" />
      </svg>
      {pinned ? 'Unpin' : 'Pin'}
    </ContextMenu.Item>

    <ContextMenu.Separator class="mx-2 my-1 border-t border-line-strong" />

    <ContextMenu.Item
      class="cli-menu-item px-3 py-1.5 text-xs font-medium"
      onSelect={() => void onArchive()}
    >
      <svg class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 7H4m2 0 1 14h10l1-14M9 7V4h6v3" />
      </svg>
      Archive
    </ContextMenu.Item>

    <ContextMenu.Item
      class="cli-menu-item px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
      onSelect={handleDelete}
    >
      <svg class="h-3.5 w-3.5 text-danger" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19 7-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
      </svg>
      Delete
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>
