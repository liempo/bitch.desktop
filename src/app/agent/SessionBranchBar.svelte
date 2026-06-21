<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import { branchSession, selectSession } from '$lib/stores/session.svelte'
  import {
    branchChildrenForSession,
    isBranchSession,
    nextBranchTitle,
    parentSessionForSession,
    relatedBranchTitle
  } from '$lib/session/branching'
  import type { SessionInfo } from '$lib/types/hermes'

  interface Props {
    connected?: boolean
    relatedSessions?: SessionInfo[]
    session?: SessionInfo | null
  }

  let { connected = false, relatedSessions = [], session = null }: Props = $props()

  let branching = $state(false)

  const parentSession = $derived(parentSessionForSession(session, relatedSessions))
  const childBranches = $derived(branchChildrenForSession(session, relatedSessions))
  const branchTitle = $derived(nextBranchTitle(session, relatedSessions))
  const branchIndicator = $derived(isBranchSession(session) ? 'BRANCH' : childBranches.length > 0 ? `${childBranches.length} FORK${childBranches.length === 1 ? '' : 'S'}` : '')
  const canFork = $derived(Boolean(connected && session?.id && !branching && (session.message_count ?? 0) > 0))
  const shellClass = `${cardClass} mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-2 border-primary/20 !bg-surface-raised/35 px-3 py-2 text-[10px] uppercase tracking-[0.12em] md:mx-auto md:w-full md:max-w-5xl`
  const branchButtonClass = 'h-7 px-2 text-[10px] uppercase tracking-[0.12em]'
  const relationButtonClass = 'h-6 max-w-56 px-2 text-[10px] uppercase tracking-[0.12em]'

  async function forkCurrentSession(): Promise<void> {
    if (!session?.id || !canFork) return

    branching = true
    try {
      await branchSession(session.id, branchTitle)
    } finally {
      branching = false
    }
  }
</script>

{#if session}
  <section class={shellClass} aria-label="Session branch controls">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-ink-muted">
      {#if branchIndicator}
        <span class="rounded-control border border-primary/35 bg-primary/10 px-2 py-1 font-bold text-primary">{branchIndicator}</span>
      {/if}

      {#if parentSession}
        <span class="text-ink-muted/80">parent</span>
        <Button
          chrome="ghost"
          size="sm"
          class={relationButtonClass}
          onclick={() => selectSession(parentSession.id)}
          aria-label="Open parent session"
          title={`Open parent session: ${relatedBranchTitle(parentSession)}`}
        >
          ↰ {relatedBranchTitle(parentSession)}
        </Button>
      {:else}
        <span class="text-ink-muted/80">root session</span>
      {/if}

      {#if childBranches.length > 0}
        <span class="text-ink-muted/80">forks</span>
        {#each childBranches as child (child.id)}
          <Button
            chrome="ghost"
            size="sm"
            class={relationButtonClass}
            onclick={() => selectSession(child.id)}
            aria-label={`Open branch ${relatedBranchTitle(child)}`}
            title={`Open branch: ${relatedBranchTitle(child)}`}
          >
            {relatedBranchTitle(child)}
          </Button>
        {/each}
      {/if}
    </div>

    <Button
      chrome="ghost"
      size="sm"
      variant="primary"
      class={branchButtonClass}
      onclick={forkCurrentSession}
      disabled={!canFork}
      aria-label="Fork current session"
      title={canFork ? `Fork session as ${branchTitle}` : 'Forking requires a resumed session with messages'}
    >
      {branching ? 'Forking…' : 'Fork session'}
    </Button>
  </section>
{/if}
