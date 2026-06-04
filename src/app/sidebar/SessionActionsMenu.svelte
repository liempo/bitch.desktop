<script lang="ts">
  import { DropdownMenu } from 'bits-ui'
  import type { SessionInfo } from '$lib/types/hermes'

  interface Props {
    disabled?: boolean
    onArchive: () => void | Promise<unknown>
    onDelete: () => void | Promise<unknown>
    onRename: (title: string) => void | Promise<unknown>
    onTogglePin: () => void | Promise<unknown>
    pinned?: boolean
    session: SessionInfo
  }

  let {
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

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="inline-flex items-center justify-center rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-40"
    aria-label="Session actions"
    {disabled}
  >
    <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  </DropdownMenu.Trigger>

  <DropdownMenu.Content
    class="z-50 min-w-38 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl shadow-black/30 backdrop-blur-lg"
    side="bottom"
    align="end"
    sideOffset={4}
  >
    <DropdownMenu.Item
      class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      onclick={handleRename}
    >
      <svg class="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828z" />
      </svg>
      Rename
    </DropdownMenu.Item>

    <DropdownMenu.Item
      class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      onclick={() => void onTogglePin()}
    >
      <svg class="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 4v12l-4 2-4-2V4M6 4h12" />
      </svg>
      {pinned ? 'Unpin' : 'Pin'}
    </DropdownMenu.Item>

    <DropdownMenu.Separator class="mx-2 my-1 border-t border-slate-700" />

    <DropdownMenu.Item
      class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      onclick={() => void onArchive()}
    >
      <svg class="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 7H4m2 0 1 14h10l1-14M9 7V4h6v3" />
      </svg>
      Archive
    </DropdownMenu.Item>

    <DropdownMenu.Item
      class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      onclick={handleDelete}
    >
      <svg class="h-3.5 w-3.5 text-red-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19 7-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
      </svg>
      Delete
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
