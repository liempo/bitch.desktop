<script lang="ts">
  import Composer from '../components/composer/Composer.svelte'
  import Thread from '../components/thread/Thread.svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { cardClass } from '@/app/components/ui/styles'
  import { agentRoute } from '../router.svelte'
  import { resumeAndHydrateStoredSession } from '$lib/hermes/sessions'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { threadForSession } from '$lib/stores/messages.svelte'
  import { profileState } from '$lib/stores/profile.svelte'
  import { sessionState, startNewSession } from '$lib/stores/session.svelte'
  import type { SessionInfo } from '$lib/types/hermes'

  interface Props {
    fallbackSessionId?: null | string
  }

  type MiniSessionMode = 'active' | 'new'

  let { fallbackSessionId = null }: Props = $props()

  let lastResumeSessionId = $state<null | string>(null)
  let miniSessionMode = $state<MiniSessionMode>('active')
  let panelSessionId = $state<null | string>(null)
  let pendingNewSession = $state(false)
  let sessionSelectorOpen = $state(false)

  const connectionState = $derived(gatewayState.connectionState)
  const defaultSessionId = $derived(sessionState.storedSessionId ?? fallbackSessionId)
  const activeSessionId = $derived(panelSessionId ?? defaultSessionId)
  const selectedSessionId = $derived(miniSessionMode === 'active' ? activeSessionId : null)
  const selectedSession = $derived(
    selectedSessionId ? (sessionState.sessions.find(session => session.id === selectedSessionId) ?? null) : null
  )
  const selectedThread = $derived(threadForSession(selectedSessionId))
  const selectedSessionProfile = $derived(
    selectedSessionId ? (selectedSession?.profile ?? sessionState.sessionProfilesById[selectedSessionId] ?? null) : null
  )
  const composerProfileName = $derived(
    selectedSessionProfile ?? profileState.newChatProfile ?? profileState.activeGatewayProfile ?? gatewayState.activeProfile
  )
  const selectableSessions = $derived(sortSelectableSessions(sessionState.sessions))
  const sessionTitle = $derived(selectedSession?.title?.trim() || (selectedSessionId ? 'Untitled session' : 'New session'))
  const selectorTitle = $derived(`AGENT: ${sessionTitle}`)
  const agentHref = $derived(`#${agentRoute(selectedSessionId)}`)

  const emptyNoticeClass = `${cardClass} rounded-control !bg-surface-raised/40 p-3 text-xs text-ink-muted`
  const optionBaseClass = [
    'grid w-full min-w-0 grid-cols-[1fr_auto] items-start gap-2 rounded-control border px-2 py-2 text-left font-mono',
    'hover:border-line-strong hover:bg-primary/10 focus-visible:border-line-strong focus-visible:bg-primary/10 focus-visible:outline-none'
  ].join(' ')

  $effect(() => {
    if (miniSessionMode === 'new' && pendingNewSession && sessionState.storedSessionId) {
      panelSessionId = sessionState.storedSessionId
      pendingNewSession = false
      miniSessionMode = 'active'
      lastResumeSessionId = null
    }
  })

  $effect(() => {
    const sessionId = selectedSessionId

    if (connectionState !== 'open') {
      lastResumeSessionId = null
      return
    }

    if (!sessionId) {
      lastResumeSessionId = null
      return
    }

    const hasHydratedRuntime =
      sessionState.storedSessionId === sessionId && Boolean(sessionState.activeSessionId) && selectedThread?.hydrated
    if (hasHydratedRuntime || selectedThread?.busy || selectedThread?.loading || sessionState.resumingSessionId === sessionId) return
    if (lastResumeSessionId === sessionId) return

    lastResumeSessionId = sessionId
    void resumeAndHydrateStoredSession(sessionId)
  })

  function selectNewSession(): void {
    panelSessionId = null
    pendingNewSession = true
    miniSessionMode = 'new'
    lastResumeSessionId = null
    sessionSelectorOpen = false
    startNewSession({ commitRoute: false })
  }

  function selectExistingSession(sessionId: string): void {
    panelSessionId = sessionId
    pendingNewSession = false
    miniSessionMode = 'active'
    lastResumeSessionId = null
    sessionSelectorOpen = false

    if (connectionState === 'open') {
      lastResumeSessionId = sessionId
      void resumeAndHydrateStoredSession(sessionId)
    }
  }

  function sortSelectableSessions(sessions: SessionInfo[]): SessionInfo[] {
    return [...sessions]
      .filter(session => !session.archived)
      .sort((left, right) => {
        if (left.id === selectedSessionId) return -1
        if (right.id === selectedSessionId) return 1
        if (left.is_active !== right.is_active) return left.is_active ? -1 : 1
        return (right.last_active || 0) - (left.last_active || 0)
      })
  }

  function formatTitle(session: SessionInfo): string {
    return session.title?.trim() || session.preview?.replace(/\s+/g, ' ').trim() || 'Untitled session'
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

  function optionClass(selected: boolean): string {
    return `${optionBaseClass} ${selected ? 'border-primary/50 bg-primary/15 text-ink-bright' : 'border-transparent text-ink'}`
  }
</script>

<Panel
  title="AGENT"
  class="min-h-0 border-line bg-surface transition-colors hover:border-line-strong"
  contentClass="flex h-full min-h-0 flex-col p-0"
  titleClass="text-ink-muted"
>
  {#snippet actions()}
    <div class="flex items-center gap-1">
      <Button
        chrome="ghost"
        size="sm"
        variant="primary"
        aria-haspopup="dialog"
        aria-expanded={sessionSelectorOpen}
        title={selectorTitle}
        onclick={() => (sessionSelectorOpen = true)}
      >
        SESSION
      </Button>
      <a
        class="inline-flex h-6 w-6 items-center justify-center rounded-control border border-transparent bg-transparent text-primary hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
        href={agentHref}
        title="Open current chat in AGENT"
        aria-label="Open current chat in AGENT"
      >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 17 17 7M9 7h8v8" />
        </svg>
      </a>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <Thread compact sessionId={selectedSessionId} />
  </div>

  <Composer
    compact
    commitRoute={false}
    sessionId={selectedSessionId}
    connected={connectionState === 'open'}
    sessionTitle={sessionTitle}
    profileName={composerProfileName}
    sidebarOpen={false}
  />
</Panel>

<Dialog
  bind:open={sessionSelectorOpen}
  title="Select AGENT Session"
  description="start new or attach AGENT to an existing session"
  class="w-[min(30rem,calc(100vw-2rem))]"
  contentClass="flex max-h-[min(34rem,calc(100vh-8rem))] flex-col p-2"
>
  <div class="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Mini session choices">
    <Button
      variant="unstyled"
      class={optionClass(miniSessionMode === 'new')}
      onclick={selectNewSession}
      role="option"
      aria-selected={miniSessionMode === 'new'}
    >
      <span class="min-w-0">
        <span class="block truncate text-[11px] font-semibold uppercase tracking-wider">New session</span>
        <span class="mt-1 block truncate text-[10px] uppercase tracking-[0.12em] text-ink-muted/80">
          start with an empty embedded thread
        </span>
      </span>
      <span class="text-[10px] uppercase tracking-[0.12em] text-ink-muted">blank</span>
    </Button>

    <div class="mt-2 border-t border-dotted border-line pt-2">
      {#if sessionState.sessionsLoading && selectableSessions.length === 0}
        <div class={emptyNoticeClass}>SYNCING_SESSION_INDEX</div>
      {:else if selectableSessions.length === 0}
        <div class={emptyNoticeClass}>NO_EXISTING_SESSIONS</div>
      {:else}
        <div class="space-y-px" aria-label="Existing sessions">
          {#each selectableSessions as session (session.id)}
            {@const title = formatTitle(session)}
            {@const preview = formatPreview(session)}
            {@const selected = miniSessionMode === 'active' && selectedSessionId === session.id}
            <Button
              variant="unstyled"
              class={optionClass(selected)}
              onclick={() => selectExistingSession(session.id)}
              role="option"
              aria-selected={selected}
              aria-label={`Select ${title}`}
            >
              <span class="min-w-0">
                <span class="block truncate text-[11px] font-semibold uppercase tracking-wider" title={title}>{title}</span>
                {#if preview}
                  <span class="mt-1 block truncate text-[10px] text-ink-muted/90" title={preview}>{preview}</span>
                {/if}
                <span class="mt-1 block truncate text-[10px] uppercase tracking-[0.12em] text-ink-muted/80">
                  {formatMeta(session)}
                </span>
              </span>
              {#if selected}
                <span class="text-[10px] uppercase tracking-[0.12em] text-primary">current</span>
              {/if}
            </Button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Dialog>
