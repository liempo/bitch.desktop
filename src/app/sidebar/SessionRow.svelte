<script lang="ts">
  import SessionActionsMenu from './SessionActionsMenu.svelte'
  import type { SessionInfo, SessionSearchResult } from '$lib/types/hermes'

  interface Props {
    active?: boolean
    disabled?: boolean
    needsInput?: boolean
    onArchive?: (session: SessionInfo) => void | Promise<unknown>
    onDelete?: (session: SessionInfo) => void | Promise<unknown>
    onRename?: (session: SessionInfo, title: string) => void | Promise<unknown>
    onSelect: (sessionId: string) => void | Promise<unknown>
    onTogglePin?: (session: SessionInfo) => void | Promise<unknown>
    pinned?: boolean
    searchResult?: SessionSearchResult | null
    session?: SessionInfo | null
    working?: boolean
  }

  let {
    active = false,
    disabled = false,
    needsInput = false,
    onArchive = () => undefined,
    onDelete = () => undefined,
    onRename = () => undefined,
    onSelect,
    onTogglePin = () => undefined,
    pinned = false,
    searchResult = null,
    session = null,
    working = false
  }: Props = $props()

  const id = $derived(session?.id ?? searchResult?.session_id ?? '')
  const title = $derived(session?.title?.trim() || (searchResult ? 'Search match' : 'Untitled session'))
  const preview = $derived(session?.preview?.trim() || stripMarkup(searchResult?.snippet) || 'No preview yet')
  const subtitle = $derived(formatSubtitle(session, searchResult))

  function stripMarkup(value: string | null | undefined): string {
    return (value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function formatSubtitle(info: SessionInfo | null, result: SessionSearchResult | null): string {
    if (info) {
      const parts = [formatRelativeTime(info.last_active), `${info.message_count} msg`]
      return parts.filter(Boolean).join(' · ')
    }

    if (result) {
      return [formatRelativeTime(result.session_started), result.model, result.source].filter(Boolean).join(' · ')
    }

    return ''
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

  function handleSelect(): void {
    if (!id || disabled) return
    void onSelect(id)
  }
</script>

{#snippet row()}
  <div
    class="cli-session-row group flex items-start px-2 py-2"
    data-active={active}
  >
    <button
      class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      onclick={handleSelect}
      {disabled}
    >
      <div class="flex items-center gap-2">
        <span class={`cli-dot shrink-0 ${working ? 'text-success' : needsInput ? 'text-warning' : active ? 'text-primary' : 'text-ink-muted/70'}`} aria-hidden="true"></span>
        {#if pinned}
          <svg class="h-3 w-3 shrink-0 text-primary" fill="currentColor" viewBox="0 0 20 20" aria-label="Pinned">
            <path d="M9.828 2.172a2 2 0 0 1 2.828 0l5.172 5.172a2 2 0 0 1-2.239 3.221l-2.175 2.176v3.088a1 1 0 0 1-1.707.707L8.5 13.328l-3.086 3.086a1 1 0 0 1-1.414-1.414l3.086-3.086-3.207-3.207a1 1 0 0 1 .707-1.707h3.088L9.85 4.825a2 2 0 0 1-.022-2.653Z" />
          </svg>
        {/if}
        <p class="truncate text-sm font-semibold text-ink-bright">{title}</p>
        {#if needsInput}
          <span class="cli-tag cli-tag-warning shrink-0 px-1.5 py-0.5 text-[0.58rem]">
            input
          </span>
        {/if}
      </div>

      <p class="mt-1 line-clamp-2 text-xs leading-4 text-ink-muted">{preview}</p>

      {#if subtitle}
        <p class="mt-1 truncate text-[0.65rem] uppercase tracking-[0.16em] text-secondary/80">{subtitle}</p>
      {/if}
    </button>
  </div>
{/snippet}

{#if session}
  <SessionActionsMenu
    {session}
    {pinned}
    {disabled}
    onArchive={() => onArchive(session)}
    onDelete={() => onDelete(session)}
    onRename={(nextTitle) => onRename(session, nextTitle)}
    onTogglePin={() => onTogglePin(session)}
  >
    {@render row()}
  </SessionActionsMenu>
{:else}
  {@render row()}
{/if}
