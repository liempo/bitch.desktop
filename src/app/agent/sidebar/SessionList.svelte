<script lang="ts">
  import SessionRow from './SessionRow.svelte'
  import { shouldShowSessionSidebarLoader } from '$lib/session/sidebar-loader'
  import { isSessionMutating, sessionNeedsInput, sessionState } from '$lib/stores/session.svelte'
  import type { SessionInfo } from '$lib/types/hermes'

  interface Props {
    onArchive: (session: SessionInfo) => void | Promise<unknown>
    onDelete: (session: SessionInfo) => void | Promise<unknown>
    onRename: (session: SessionInfo, title: string) => void | Promise<unknown>
    onSelect: (sessionId: string) => void | Promise<unknown>
    onTogglePin: (session: SessionInfo) => void | Promise<unknown>
    pinned?: boolean
    sessions: SessionInfo[]
  }

  let {
    onArchive,
    onDelete,
    onRename,
    onSelect,
    onTogglePin,
    pinned = false,
    sessions
  }: Props = $props()
</script>

<div>
  {#each sessions as session (session.id)}
    <SessionRow
      {session}
      active={sessionState.storedSessionId === session.id}
      {pinned}
      disabled={isSessionMutating(session.id)}
      working={shouldShowSessionSidebarLoader(session.id)}
      needsInput={sessionNeedsInput(session.id)}
      {onSelect}
      onRename={(target, title) => onRename(target, title)}
      onArchive={target => onArchive(target)}
      onDelete={target => onDelete(target)}
      onTogglePin={target => onTogglePin(target)}
    />
  {/each}
</div>
