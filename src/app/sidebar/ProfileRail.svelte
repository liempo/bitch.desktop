<script lang="ts">
  import { onMount } from 'svelte'
  import { profileColor, resolveProfileColor } from '$lib/profile-color'
  import {
    ALL_PROFILES,
    getProfileScope,
    profileState,
    refreshActiveProfile,
    selectProfile,
    setShowAllProfiles,
    sortByProfileOrder
  } from '$lib/stores/profile.svelte'
  import type { ProfileInfo } from '$lib/types/hermes'

  const visibleProfiles = $derived(sortByProfileOrder(profileState.profiles))
  const showRail = $derived(visibleProfiles.length > 1)
  const scope = $derived(getProfileScope())

  onMount(() => {
    void refreshActiveProfile()
  })

  function labelFor(profile: ProfileInfo): string {
    return profile.is_default ? 'Default profile' : profile.name
  }

  function initials(profile: ProfileInfo): string {
    const name = profile.is_default ? 'D' : profile.name
    return name.slice(0, 2).toUpperCase()
  }

  function colorFor(profile: ProfileInfo): string | null {
    return resolveProfileColor(profile.name, profileState.profileColors) ?? profileColor(profile.name)
  }
</script>

{#if showRail}
  <div class="border-t border-slate-800 p-3" aria-label="Profiles">
    <div class="mb-2 flex items-center justify-between">
      <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-600">Profiles</p>
      <button
        class={`rounded-md px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] transition ${
          scope === ALL_PROFILES
            ? 'bg-sky-500/15 text-sky-300'
            : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
        }`}
        type="button"
        onclick={() => setShowAllProfiles(scope !== ALL_PROFILES)}
        title="Show sessions from all profiles"
      >
        All
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      {#each visibleProfiles as profile (profile.name)}
        {@const color = colorFor(profile)}
        {@const active = scope !== ALL_PROFILES && profileState.activeGatewayProfile === profile.name}
        <button
          class={`flex h-9 min-w-9 items-center justify-center rounded-xl border px-2 text-[0.65rem] font-bold uppercase tracking-wide transition ${
            active
              ? 'border-sky-400/60 bg-sky-500/15 text-sky-100 shadow-sm shadow-sky-500/20'
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
          }`}
          style={color ? `box-shadow: inset 0 -2px 0 ${color};` : ''}
          type="button"
          onclick={() => selectProfile(profile.name)}
          title={labelFor(profile)}
        >
          {initials(profile)}
        </button>
      {/each}
    </div>

    {#if profileState.error}
      <p class="mt-2 text-[0.65rem] text-red-300">{profileState.error}</p>
    {/if}
  </div>
{/if}
