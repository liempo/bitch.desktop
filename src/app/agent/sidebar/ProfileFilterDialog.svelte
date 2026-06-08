<script lang="ts">
  import { Dialog } from 'bits-ui'
  import Button from '@/components/ui/Button.svelte'
  import { popoverClass } from '@/components/ui/styles'
  import {
    ALL_PROFILES,
    getProfileScope,
    normalizeProfileKey,
    profileState,
    selectProfile,
    setShowAllProfiles,
    sortByProfileOrder
  } from '$lib/stores/profile.svelte'
  import type { ProfileInfo } from '$lib/types/hermes'

  interface Props {
    groupByProfile?: boolean
    open?: boolean
  }

  let { groupByProfile = $bindable(false), open = $bindable(false) }: Props = $props()

  const contentClass = `${popoverClass} fixed left-1/2 top-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-2 font-mono`
  const optionBaseClass =
    'grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-control px-2 py-2 text-left font-mono text-[11px] uppercase tracking-[0.08em] hover:bg-surface-raised'

  const scope = $derived(getProfileScope())
  const orderedProfiles = $derived(orderProfiles(profileState.profiles))

  function orderProfiles(profiles: ProfileInfo[]): ProfileInfo[] {
    const defaults = profiles.filter(profile => profile.is_default)
    const rest = sortByProfileOrder(profiles.filter(profile => !profile.is_default))

    return [...defaults, ...rest]
  }

  function labelFor(profile: ProfileInfo): string {
    return profile.is_default ? 'default' : profile.name
  }

  function profileSelected(profile: ProfileInfo): boolean {
    return scope !== ALL_PROFILES && normalizeProfileKey(profile.name) === normalizeProfileKey(profileState.activeGatewayProfile)
  }

  function selectAllProfiles(): void {
    setShowAllProfiles(true)
    open = false
  }

  function selectProfileFilter(profile: ProfileInfo): void {
    selectProfile(profile.name)
    open = false
  }

  function toggleGroupByProfile(): void {
    groupByProfile = !groupByProfile
  }

  function optionClass(selected: boolean): string {
    return `${optionBaseClass} ${selected ? 'bg-primary/15 font-semibold text-ink-bright' : 'text-ink'}`
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-40 bg-overlay" />
    <Dialog.Content class={contentClass}>
      <div class="flex items-center justify-between border-b border-line px-2 py-1.5">
        <Dialog.Title class="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Profile_Filter</Dialog.Title>
        <Dialog.Close class="border-none bg-transparent px-1 py-0 text-xs text-ink-muted hover:text-ink-bright" aria-label="Close profile filter">
          x
        </Dialog.Close>
      </div>

      <Dialog.Description class="px-2 py-2 text-[11px] uppercase tracking-[0.08em] text-ink-muted">
        choose session index scope
      </Dialog.Description>

      <div class="grid gap-1" role="listbox" aria-label="Profile filters">
        <Button
          variant="unstyled"
          class={optionClass(scope === ALL_PROFILES)}
          onclick={selectAllProfiles}
          role="option"
          aria-selected={scope === ALL_PROFILES}
        >
          <span>all (default)</span>
          <span class="text-[10px] text-ink-muted">*</span>
        </Button>

        {#each orderedProfiles as profile (profile.name)}
          {@const selected = profileSelected(profile)}
            <Button
              variant="unstyled"
              class={optionClass(selected)}
            onclick={() => selectProfileFilter(profile)}
            role="option"
            aria-selected={selected}
          >
            <span class="truncate">{labelFor(profile)}</span>
            <span class="text-[10px] text-ink-muted">{profile.is_default ? 'root' : 'profile'}</span>
          </Button>
        {/each}
      </div>

      <div class="mt-2 border-t border-dotted border-line px-0 pt-2">
        <Button
          variant="unstyled"
          class={optionClass(groupByProfile)}
          onclick={toggleGroupByProfile}
          aria-pressed={groupByProfile}
        >
          <span>group by profile</span>
          <span class="text-[10px] text-ink-muted">{groupByProfile ? 'on' : 'off'}</span>
        </Button>
      </div>

      {#if profileState.loading}
        <p class="px-2 pt-2 text-[11px] uppercase tracking-[0.08em] text-ink-muted">loading profiles...</p>
      {/if}
      {#if profileState.error}
        <p class="px-2 pt-2 text-[11px] text-danger">{profileState.error}</p>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
