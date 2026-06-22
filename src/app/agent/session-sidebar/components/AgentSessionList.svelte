<script lang="ts">
  import AgentSessionRow from './AgentSessionRow.svelte'
  import { shouldShowSessionSidebarLoader } from '$lib/hermes/sessions'
  import { isSessionMutating, sessionNeedsInput, sessionState } from '$lib/hermes/sessions'
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
    <AgentSessionRow
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
