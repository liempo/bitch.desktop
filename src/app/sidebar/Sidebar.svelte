<script lang="ts">
  import { onMount } from 'svelte'
  import ProfileRail from './ProfileRail.svelte'
  import SessionRow from './SessionRow.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import {
    archiveSession,
    clearSearch,
    startNewSession,
    deleteSession,
    hasMoreSessions,
    isPinned,
    isPinnedId,
    isSessionMutating,
    isSessionWorking,
    loadMoreSessions,
    renameSession,
    searchResultPinId,
    selectSession,
    sessionNeedsInput,
    sessionState,
    setSearchQuery,
    toggleSessionPinned
  } from '$lib/stores/session.svelte'
  import { ALL_PROFILES, getProfileScope } from '$lib/stores/profile.svelte'
  import type { SessionInfo } from '$lib/types/hermes'

  const connected = $derived(gatewayState.connectionState === 'open')
  const searchActive = $derived(sessionState.searchQuery.trim().length > 0)
  const pinnedSessions = $derived(sessionState.sessions.filter(session => isPinned(session)))
  const recentSessions = $derived(sessionState.sessions.filter(session => !isPinned(session)))
  const groupedRecentSessions = $derived(groupSessionsByProfile(recentSessions))
  const canLoadMore = $derived(hasMoreSessions() && !searchActive)
  const scope = $derived(getProfileScope())
  const loadingRows = [0, 1, 2, 3, 4, 5]

  onMount(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void handleNewChat()
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  })

  function handleSearchInput(event: Event): void {
    setSearchQuery((event.currentTarget as HTMLInputElement).value)
  }

  function handleNewChat(): void {
    if (!connected) return
    startNewSession()
  }

  function sessionDisabled(session: SessionInfo): boolean {
    return isSessionMutating(session.id)
  }

  function groupSessionsByProfile(sessions: SessionInfo[]): Array<{ name: string; sessions: SessionInfo[] }> {
    const groups = new Map<string, SessionInfo[]>()

    for (const session of sessions) {
      const name = session.profile ?? 'default'
      const group = groups.get(name)

      if (group) {
        group.push(session)
      } else {
        groups.set(name, [session])
      }
    }

    return [...groups.entries()].map(([name, items]) => ({ name, sessions: items }))
  }
</script>

<aside class="cli-panel flex h-64 w-full shrink-0 flex-col p-0 md:h-full md:w-72" aria-label="Session index">
  <div class="cli-panel-header text-warning">Session_Index</div>
  <div class="border-b border-line px-3 pb-3 pt-5">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="cli-section-title text-warning">Sessions</h2>
      <button
        class="bitch-button bitch-button-primary"
        type="button"
        onclick={handleNewChat}
        disabled={!connected}
        title="New chat (Ctrl/⌘+N)"
      >
        + New
      </button>
    </div>

    <label class="sr-only" for="session-search">Search sessions</label>
    <div class="relative">
      <svg class="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
      </svg>
      <input
        id="session-search"
        class="cli-input py-2 pl-9 pr-8 text-sm"
        type="search"
        placeholder="grep session_index"
        value={sessionState.searchQuery}
        oninput={handleSearchInput}
        disabled={!connected}
      />
      {#if sessionState.searchQuery}
        <button
          class="absolute right-2 top-1.5 p-1 text-ink-muted transition hover:text-primary"
          type="button"
          onclick={clearSearch}
          aria-label="Clear search"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if !connected}
      <div class="cli-empty">
        LINK_DOWN: connect to the Hermes gateway before loading sessions.
      </div>
    {:else if sessionState.sessionsLoading && !sessionState.sessionsInitialized}
      <div class="space-y-2" aria-label="Loading sessions">
        {#each loadingRows as row (row)}
          <div class="cli-card h-18 animate-pulse"></div>
        {/each}
      </div>
    {:else if searchActive}
      <section aria-label="Search results">
        <div class="mb-2 flex items-center justify-between px-1">
          <h3 class="cli-section-title">Search</h3>
          {#if sessionState.searching}
            <span class="text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">searching…</span>
          {/if}
        </div>

        {#if sessionState.searchError}
          <div class="cli-card border-danger/35 bg-danger/10 p-3 text-xs text-danger">
            {sessionState.searchError}
          </div>
        {:else if !sessionState.searching && sessionState.searchResults.length === 0}
          <div class="cli-empty">
            NULL_RESULT: no matching sessions. Night City remains indifferent.
          </div>
        {:else}
          <div class="space-y-1.5">
            {#each sessionState.searchResults as result (result.session_id + result.snippet)}
              <SessionRow
                searchResult={result}
                active={sessionState.storedSessionId === result.session_id}
                pinned={isPinnedId(searchResultPinId(result))}
                working={isSessionWorking(result.session_id) || sessionState.resumingSessionId === result.session_id}
                needsInput={sessionNeedsInput(result.session_id)}
                onSelect={selectSession}
              />
            {/each}
          </div>
        {/if}
      </section>
    {:else}
      {#if sessionState.error}
        <div class="cli-card mb-3 border-danger/35 bg-danger/10 p-3 text-xs text-danger">
          {sessionState.error}
        </div>
      {/if}

      {#if pinnedSessions.length > 0}
        <section class="mb-4" aria-label="Pinned sessions">
          <h3 class="cli-section-title mb-2 px-1">Pinned</h3>
          <div class="space-y-1.5">
            {#each pinnedSessions as session (session.id)}
              <SessionRow
                {session}
                active={sessionState.storedSessionId === session.id}
                pinned={true}
                disabled={sessionDisabled(session)}
                working={isSessionWorking(session.id) || sessionState.resumingSessionId === session.id}
                needsInput={sessionNeedsInput(session.id)}
                onSelect={selectSession}
                onRename={(target, title) => renameSession(target.id, title)}
                onArchive={(target) => archiveSession(target.id)}
                onDelete={(target) => deleteSession(target.id)}
                onTogglePin={toggleSessionPinned}
              />
            {/each}
          </div>
        </section>
      {/if}

      <section aria-label="Recent sessions">
        <div class="mb-2 flex items-center justify-between px-1">
          <h3 class="cli-section-title">Recents</h3>
          {#if sessionState.sessionsLoading}
            <span class="text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted">refreshing…</span>
          {/if}
        </div>

        {#if recentSessions.length === 0}
          <div class="cli-empty">
            EMPTY_INDEX: create one and give the chrome something to chew on.
          </div>
        {:else if scope === ALL_PROFILES}
          <div class="space-y-4">
            {#each groupedRecentSessions as group (group.name)}
              <div>
                <h4 class="mb-1 px-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-secondary">
                  {group.name}
                </h4>
                <div class="space-y-1.5">
                  {#each group.sessions as session (session.id)}
                    <SessionRow
                      {session}
                      active={sessionState.storedSessionId === session.id}
                      pinned={false}
                      disabled={sessionDisabled(session)}
                      working={isSessionWorking(session.id) || sessionState.resumingSessionId === session.id}
                      needsInput={sessionNeedsInput(session.id)}
                      onSelect={selectSession}
                      onRename={(target, title) => renameSession(target.id, title)}
                      onArchive={(target) => archiveSession(target.id)}
                      onDelete={(target) => deleteSession(target.id)}
                      onTogglePin={toggleSessionPinned}
                    />
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="space-y-1.5">
            {#each recentSessions as session (session.id)}
              <SessionRow
                {session}
                active={sessionState.storedSessionId === session.id}
                pinned={false}
                disabled={sessionDisabled(session)}
                working={isSessionWorking(session.id) || sessionState.resumingSessionId === session.id}
                needsInput={sessionNeedsInput(session.id)}
                onSelect={selectSession}
                onRename={(target, title) => renameSession(target.id, title)}
                onArchive={(target) => archiveSession(target.id)}
                onDelete={(target) => deleteSession(target.id)}
                onTogglePin={toggleSessionPinned}
              />
            {/each}
          </div>
        {/if}
      </section>

      {#if canLoadMore}
        <button
          class="bitch-button mt-3 w-full"
          type="button"
          onclick={() => void loadMoreSessions()}
          disabled={sessionState.sessionsLoadingMore}
        >
          {sessionState.sessionsLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      {/if}
    {/if}
  </div>

  <ProfileRail />
</aside>
