<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import { gatewayState } from '$lib/hermes/gateway'
  import {
    hasMoreArchivedSessions,
    isSessionMutating,
    loadArchivedSessions,
    loadMoreArchivedSessions,
    restoreArchivedSession,
    sessionState,
    sessionLineageId
  } from '$lib/hermes/sessions'
  import type { SessionInfo } from '$lib/types/hermes'

  interface Props {
    open?: boolean
  }

  let { open = $bindable(false) }: Props = $props()

  const connected = $derived(gatewayState.connectionState === 'open')
  const loadingInitial = $derived(sessionState.archivedSessionsLoading && sessionState.archivedSessions.length === 0)
  const canLoadMore = $derived(hasMoreArchivedSessions())
  const mutedNoticeClass = `${cardClass} rounded-control !bg-surface-raised/40 p-3 text-xs text-ink-muted`
  const dangerNoticeClass = `${cardClass} rounded-control border-danger/35 !bg-danger/10 p-3 text-xs text-danger`

  $effect(() => {
    if (open && connected) {
      void loadArchivedSessions()
    }
  })

  function formatTitle(session: SessionInfo): string {
    return session.title?.trim() || 'Untitled session'
  }

  function formatPreview(session: SessionInfo): string {
    return session.preview?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function formatMeta(session: SessionInfo): string {
    const parts = [formatRelativeTime(session.last_active), `${session.message_count} msg`, formatProfile(session)]
    return parts.filter(Boolean).join(' · ')
  }

  function formatProfile(session: SessionInfo): string {
    const profile = session.profile?.trim()
    if (!profile || session.is_default_profile || profile.toLowerCase() === 'default') return ''
    return profile.toUpperCase()
  }

  function formatRelativeTime(timestamp: null | number | undefined): string {
    if (!timestamp) return ''

    const millis = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
    const diff = Date.now() - millis
    const minute = 60_000
    const hour = minute * 60
    const day = hour * 24

    if (diff < minute) return 'just now'
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`
    if (diff < day) return `${Math.floor(diff / hour)}h ago`
    if (diff < day * 30) return `${Math.floor(diff / day)}d ago`

    return new Date(millis).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  function restore(session: SessionInfo): void {
    void restoreArchivedSession(session)
  }
</script>

<Dialog
  bind:open
  title="Archives"
  description="restore archived sessions"
  class="w-[min(30rem,calc(100vw-2rem))]"
  contentClass="flex max-h-[min(34rem,calc(100vh-8rem))] flex-col p-2"
>
  {#if !connected}
    <div class={mutedNoticeClass}>LINK_DOWN: connect to the Hermes gateway before loading archives.</div>
  {:else if loadingInitial}
    <div class="flex min-h-32 items-center justify-center" aria-label="Loading archived sessions" role="status">
      <Loader size="lg" label="Loading archived sessions" />
    </div>
  {:else if sessionState.archivedError}
    <div class={dangerNoticeClass}>{sessionState.archivedError}</div>
  {:else if sessionState.archivedSessions.length === 0}
    <div class={mutedNoticeClass}>EMPTY_ARCHIVE: no archived sessions to restore.</div>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="space-y-px">
        {#each sessionState.archivedSessions as session (session.id)}
          {@const title = formatTitle(session)}
          {@const preview = formatPreview(session)}
          {@const mutating = isSessionMutating(session.id) || isSessionMutating(sessionLineageId(session))}
          <article class="grid min-w-0 grid-cols-[1fr_auto] items-center gap-2 border border-transparent px-2 py-2 hover:border-line hover:bg-primary/5">
            <div class="min-w-0">
              <h3 class="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-bright" title={title}>{title}</h3>
              {#if preview}
                <p class="mt-1 truncate text-[10px] text-ink-muted/90" title={preview}>{preview}</p>
              {/if}
              <p class="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-ink-muted/80">{formatMeta(session)}</p>
            </div>

            <Button
              size="sm"
              variant="primary"
              onclick={() => restore(session)}
              disabled={mutating}
              aria-label={mutating ? `Restoring ${title}` : `Restore ${title}`}
            >
              {#if mutating}
                <Loader size="sm" label={`Restoring ${title}`} />
              {:else}
                restore
              {/if}
            </Button>
          </article>
        {/each}
      </div>

      {#if canLoadMore}
        <Button
          class="mt-3 w-full"
          onclick={() => void loadMoreArchivedSessions()}
          disabled={sessionState.archivedSessionsLoadingMore}
          aria-label={sessionState.archivedSessionsLoadingMore ? 'Loading more archived sessions' : 'Load more archived sessions'}
        >
          {#if sessionState.archivedSessionsLoadingMore}
            <Loader size="sm" label="Loading more archived sessions" />
          {:else}
            Load more
          {/if}
        </Button>
      {/if}
    </div>
  {/if}
</Dialog>
