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

<aside class="flex h-full w-70 shrink-0 flex-col border-r border-slate-800 bg-slate-950/50">
  <div class="border-b border-slate-800 p-3">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Sessions</h2>
      <button
        class="rounded-md px-2 py-1 text-xs font-medium text-sky-400 transition hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
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
      <svg class="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
      </svg>
      <input
        id="session-search"
        class="w-full rounded-xl border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-8 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        type="search"
        placeholder="Search sessions"
        value={sessionState.searchQuery}
        oninput={handleSearchInput}
        disabled={!connected}
      />
      {#if sessionState.searchQuery}
        <button
          class="absolute right-2 top-1.5 rounded-md p-1 text-slate-600 transition hover:bg-slate-800 hover:text-slate-300"
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
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
        Connect to the Hermes gateway before loading sessions.
      </div>
    {:else if sessionState.sessionsLoading && !sessionState.sessionsInitialized}
      <div class="space-y-2" aria-label="Loading sessions">
        {#each loadingRows as row (row)}
          <div class="h-18 animate-pulse rounded-xl bg-slate-900/70"></div>
        {/each}
      </div>
    {:else if searchActive}
      <section aria-label="Search results">
        <div class="mb-2 flex items-center justify-between px-1">
          <h3 class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-600">Search</h3>
          {#if sessionState.searching}
            <span class="text-[0.65rem] text-slate-600">searching…</span>
          {/if}
        </div>

        {#if sessionState.searchError}
          <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {sessionState.searchError}
          </div>
        {:else if !sessionState.searching && sessionState.searchResults.length === 0}
          <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
            No matching sessions. Night City remains indifferent.
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
        <div class="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {sessionState.error}
        </div>
      {/if}

      {#if pinnedSessions.length > 0}
        <section class="mb-4" aria-label="Pinned sessions">
          <h3 class="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-600">Pinned</h3>
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
          <h3 class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-600">Recents</h3>
          {#if sessionState.sessionsLoading}
            <span class="text-[0.65rem] text-slate-600">refreshing…</span>
          {/if}
        </div>

        {#if recentSessions.length === 0}
          <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
            No sessions yet. Create one and give the chrome something to chew on.
          </div>
        {:else if scope === ALL_PROFILES}
          <div class="space-y-4">
            {#each groupedRecentSessions as group (group.name)}
              <div>
                <h4 class="mb-1 px-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
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
          class="mt-3 w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
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
