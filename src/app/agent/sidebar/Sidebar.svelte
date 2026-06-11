<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import TextInput from '@/components/ui/TextInput.svelte'
  import { cardClass } from '@/components/ui/styles'
  import ArchivedSessionsDialog from './ArchivedSessionsDialog.svelte'
  import ProfileFilterDialog from './ProfileFilterDialog.svelte'
  import SessionList from './SessionList.svelte'
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
  import {
    ALL_PROFILES,
    getProfileScope,
    normalizeProfileKey,
    profileState,
    selectMainNewSessionProfile
  } from '$lib/stores/profile.svelte'
  import type { SessionInfo } from '$lib/types/hermes'

  const GROUP_BY_PROFILE_STORAGE_KEY = 'bitch.desktop.groupSessionsByProfile'
  const sectionHeadingClass = 'font-hud text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted'
  const mutedNoticeClass = `${cardClass} rounded-control !bg-surface-raised/40 p-3 text-xs text-ink-muted`
  const dangerNoticeClass = `${cardClass} rounded-control border-danger/35 !bg-danger/10 p-3 text-xs text-danger`

  const connected = $derived(gatewayState.connectionState === 'open')
  const hasLoadedSessionIndex = $derived(
    sessionState.sessionsInitialized || sessionState.sessions.length > 0 || sessionState.searchResults.length > 0
  )
  const searchActive = $derived(sessionState.searchQuery.trim().length > 0)
  const pinnedSessions = $derived(sortSessionsByLastActive(sessionState.sessions.filter(session => isPinned(session))))
  const recentSessions = $derived(sortSessionsByLastActive(sessionState.sessions.filter(session => !isPinned(session))))
  const groupedRecentSessions = $derived(groupSessionsByProfile(recentSessions))
  const canLoadMore = $derived(hasMoreSessions() && !searchActive)
  const scope = $derived(getProfileScope())
  const defaultProfileName = $derived(profileState.profiles.find(profile => profile.is_default)?.name ?? 'default')
  const nonDefaultProfileFilterActive = $derived(
    scope !== ALL_PROFILES && normalizeProfileKey(scope) !== normalizeProfileKey(defaultProfileName)
  )
  const loadingRows = [0, 1, 2, 3, 4, 5]
  let archivesOpen = $state(false)
  let profileFilterOpen = $state(false)
  let groupSessionsByProfileEnabled = $state(readGroupSessionsByProfile())

  $effect(() => {
    writeGroupSessionsByProfile(groupSessionsByProfileEnabled)
  })

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

    selectMainNewSessionProfile()
    startNewSession()
  }

  function readGroupSessionsByProfile(): boolean {
    if (typeof globalThis.localStorage === 'undefined') return false

    return globalThis.localStorage.getItem(GROUP_BY_PROFILE_STORAGE_KEY) === 'true'
  }

  function writeGroupSessionsByProfile(value: boolean): void {
    if (typeof globalThis.localStorage === 'undefined') return

    globalThis.localStorage.setItem(GROUP_BY_PROFILE_STORAGE_KEY, value ? 'true' : 'false')
  }

  function sortSessionsByLastActive(sessions: SessionInfo[]): SessionInfo[] {
    return [...sessions].sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
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

<aside class="box-border flex h-64 w-full shrink-0 flex-col pb-3 pl-3 pt-3 md:h-full md:w-80" aria-label="Session index">
  <div class="min-h-0 flex-1">
    <Panel title="Sessions" padded={false}>
      {#snippet actions()}
        <Button
          variant="unstyled"
          class="flex h-5 w-6 items-center justify-center p-0 text-ink-muted hover:text-ink-bright"
          onclick={handleNewChat}
          oncontextmenu={event => event.preventDefault()}
          disabled={!connected}
          aria-label="New chat"
          title="New chat (Ctrl/⌘+N)."
        >
          +
        </Button>
        <Button
          variant="unstyled"
          class="flex h-5 w-6 items-center justify-center p-0 text-ink-muted hover:text-ink-bright"
          onclick={() => (archivesOpen = true)}
          disabled={!connected}
          aria-label="Open archives"
          title="Archives"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M6 7l1.25-3h9.5L18 7M6 7v13h12V7M9 12h6" />
          </svg>
        </Button>
        <Button
          variant="unstyled"
          class={`flex h-5 w-6 items-center justify-center p-0 hover:text-ink-bright ${
            nonDefaultProfileFilterActive ? 'text-primary' : 'text-ink-muted'
          }`}
          onclick={() => (profileFilterOpen = true)}
          aria-label="Filter profiles"
          title="Filter profiles"
        >
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </Button>
      {/snippet}

    <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div class="border-b border-line px-3 pb-3 pt-5">
        <label class="sr-only" for="session-search">Search sessions</label>
        <div class="relative">
          <svg
            class="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
            />
          </svg>
          <TextInput
            id="session-search"
            class="py-2 pl-9 pr-8 text-sm"
            type="search"
            placeholder="grep session_index"
            value={sessionState.searchQuery}
            oninput={handleSearchInput}
            disabled={!connected}
          />
          {#if sessionState.searchQuery}
            <Button
              variant="unstyled"
              class="absolute right-2 top-1.5 p-1 text-ink-muted hover:text-primary"
              onclick={clearSearch}
              aria-label="Clear search"
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </Button>
          {/if}
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
            {#if !connected && !hasLoadedSessionIndex}
              <div class={mutedNoticeClass}>
                LINK_DOWN: connect to the Hermes gateway before loading sessions.
              </div>
            {:else if sessionState.sessionsLoading && !sessionState.sessionsInitialized}
              <div class="space-y-1.5" aria-label="Loading sessions">
                {#each loadingRows as row (row)}
                  <div class="h-18 rounded-control border border-line bg-surface-raised/50"></div>
                {/each}
              </div>
            {:else if searchActive}
              <section aria-label="Search results">
                <div class="mb-1.5 flex items-center justify-between px-1">
                  <h3 class={sectionHeadingClass}>Search</h3>
                  {#if sessionState.searching}
                    <span class="text-[10px] uppercase tracking-[0.14em] text-ink-muted">searching</span>
                  {/if}
                </div>

                {#if sessionState.searchError}
                  <div class={dangerNoticeClass}>
                    {sessionState.searchError}
                  </div>
                {:else if !sessionState.searching && sessionState.searchResults.length === 0}
                  <div class={mutedNoticeClass}>
                    NULL_RESULT: no matching sessions. Night City remains indifferent.
                  </div>
                {:else}
                  <div class="space-y-px">
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
                <div class={`${dangerNoticeClass} mb-3`}>
                  {sessionState.error}
                </div>
              {/if}

              {#if pinnedSessions.length > 0}
                <section class="mb-4" aria-label="Pinned sessions">
                  <h3 class={`${sectionHeadingClass} mb-1.5 px-1`}>
                    Pinned
                  </h3>
                  <SessionList
                    sessions={pinnedSessions}
                    pinned={true}
                    onSelect={selectSession}
                    onRename={(target, title) => renameSession(target.id, title)}
                    onArchive={target => archiveSession(target.id)}
                    onDelete={target => deleteSession(target.id)}
                    onTogglePin={toggleSessionPinned}
                  />
                </section>
              {/if}

              <section aria-label="Recent sessions">
                <div class="mb-1.5 flex items-center justify-between px-1">
                  <h3 class={sectionHeadingClass}>Recents</h3>
                  {#if sessionState.sessionsLoading}
                    <span class="text-[10px] uppercase tracking-[0.14em] text-ink-muted">refreshing</span>
                  {/if}
                </div>

                {#if recentSessions.length === 0}
                  <div class={mutedNoticeClass}>
                    EMPTY_INDEX: create one and give the chrome something to chew on.
                  </div>
                {:else if scope === ALL_PROFILES && groupSessionsByProfileEnabled}
                  <div class="space-y-4">
                    {#each groupedRecentSessions as group (group.name)}
                      <div>
                        <h4 class="mb-1 px-1 font-hud text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                          {group.name}
                        </h4>
                        <SessionList
                          sessions={group.sessions}
                          onSelect={selectSession}
                          onRename={(target, title) => renameSession(target.id, title)}
                          onArchive={target => archiveSession(target.id)}
                          onDelete={target => deleteSession(target.id)}
                          onTogglePin={toggleSessionPinned}
                        />
                      </div>
                    {/each}
                  </div>
                {:else}
                  <SessionList
                    sessions={recentSessions}
                    onSelect={selectSession}
                    onRename={(target, title) => renameSession(target.id, title)}
                    onArchive={target => archiveSession(target.id)}
                    onDelete={target => deleteSession(target.id)}
                    onTogglePin={toggleSessionPinned}
                  />
                {/if}
              </section>

              {#if canLoadMore}
                <Button
                  class="mt-3 w-full"
                  onclick={() => void loadMoreSessions()}
                  disabled={sessionState.sessionsLoadingMore}
                >
                  {sessionState.sessionsLoadingMore ? 'Loading' : 'Load more'}
                </Button>
              {/if}
            {/if}
      </div>

    </div>
    </Panel>
  </div>

  <ArchivedSessionsDialog bind:open={archivesOpen} />
  <ProfileFilterDialog bind:open={profileFilterOpen} bind:groupByProfile={groupSessionsByProfileEnabled} />
</aside>
