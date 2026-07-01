<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import AgentSessionActionsMenu from './AgentSessionActionsMenu.svelte'
  import { formatAgentSessionTitle } from '../session-labels'
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
  const title = $derived(formatTitle(session, searchResult))
  const subtitle = $derived(formatSubtitle(session, searchResult))
  const profileTag = $derived(formatProfileTag(session, searchResult))

  const SESSION_ROW =
    'group relative -mx-2 flex min-w-0 items-stretch border border-transparent bg-transparent ' +
    'hover:border-line hover:bg-primary/5 ' +
    'data-[selected=true]:border-primary/50 data-[selected=true]:bg-primary/10 data-[selected=true]:font-semibold ' +
    'data-[selected=true]:text-ink-bright ' +
    'data-[disabled=true]:opacity-50'

  function formatTitle(info: SessionInfo | null, result: SessionSearchResult | null): string {
    if (info) return formatAgentSessionTitle(info)
    if (result) return formatAgentSessionTitle(result)
    return 'Session unknown'
  }

  function formatSubtitle(info: SessionInfo | null, result: SessionSearchResult | null): string {
    if (info) {
      return formatRelativeTime(info.last_active)
    }

    if (result) {
      return normalizePreview(result.preview ?? result.snippet)
    }

    return ''
  }

  function normalizePreview(value: null | string | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function formatProfileTag(info: SessionInfo | null, result: SessionSearchResult | null): string {
    const profile = (info?.profile ?? result?.profile)?.trim()

    if (!profile || info?.is_default_profile || profile.toLowerCase() === 'default') return ''

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

  function handleSelect(): void {
    if (!id || disabled) return
    void onSelect(id)
  }
</script>

{#snippet row()}
  <div class={SESSION_ROW} data-selected={active ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
    <Button
      variant="unstyled"
      class="grid min-w-0 flex-1 gap-1.5 px-4 py-2 text-left text-inherit"
      onclick={handleSelect}
      {disabled}
      aria-pressed={active}
    >
      <span class="flex min-w-0 items-center gap-1.5 text-[11px]">
        <span class="flex min-w-0 flex-1 items-center gap-1 truncate uppercase tracking-wider" title={title}>
          {#if working}
            <Loader size="sm" tone="secondary" label="Session thinking" />
          {/if}
          <span class="min-w-0 truncate">{title}</span>
        </span>
        {#if pinned}
          <span class="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">PIN</span>
        {/if}
        {#if needsInput}
          <span class="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-warning">
            INPUT
          </span>
        {/if}
      </span>

      {#if subtitle}
        <span class="flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-ink-muted/80">
          <span class="min-w-0 truncate">{subtitle}</span>
          {#if profileTag}
            <span class="shrink-0 text-ink-muted/80">·</span>
            <span class="shrink-0 text-ink-muted/80">{profileTag}</span>
          {/if}
        </span>
      {/if}
    </Button>

  </div>
{/snippet}

{#if session}
  <AgentSessionActionsMenu
    {session}
    {pinned}
    {disabled}
    onArchive={() => onArchive(session)}
    onDelete={() => onDelete(session)}
    onRename={(nextTitle) => onRename(session, nextTitle)}
    onTogglePin={() => onTogglePin(session)}
  >
    {@render row()}
  </AgentSessionActionsMenu>
{:else}
  {@render row()}
{/if}
