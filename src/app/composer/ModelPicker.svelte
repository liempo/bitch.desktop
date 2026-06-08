<script lang="ts">
  import { Popover } from 'bits-ui'
  import type { ComposerModelGroup, ComposerModelOption, ReasoningEffort } from '$lib/stores/composer.svelte'

  interface Props {
    busy?: boolean
    connected?: boolean
    currentFastMode: boolean
    currentModelLabel: string
    currentModelOption?: ComposerModelOption | null
    currentReasoningEffort: ReasoningEffort
    disabled?: boolean
    fastSupported: boolean
    fastSwitching: boolean
    modelGroups: ComposerModelGroup[]
    modelLoading: boolean
    reasoningSupported: boolean
    reasoningSwitching: boolean
    switching: boolean
    onFastChange: (enabled: boolean) => void
    onModelSelect: (key: string) => void
    onReasoningChange: (effort: ReasoningEffort) => void
  }

  let {
    busy = false,
    connected = true,
    currentFastMode,
    currentModelLabel,
    currentModelOption = null,
    currentReasoningEffort,
    disabled = false,
    fastSupported,
    fastSwitching,
    modelGroups,
    modelLoading,
    reasoningSupported,
    reasoningSwitching,
    switching,
    onFastChange,
    onModelSelect,
    onReasoningChange
  }: Props = $props()

  let open = $state(false)
  let search = $state('')

  const isDisabled = $derived(!connected || disabled || switching)
  const isLoading = $derived(modelLoading || switching || reasoningSwitching || fastSwitching)

  interface FlattenedOption extends ComposerModelOption {
    groupName: string
    groupWarning?: string
  }

  const flattenedOptions = $derived(
    modelGroups.flatMap(
      (group): FlattenedOption[] =>
        group.options.map(option => ({
          ...option,
          groupName: group.name,
          groupWarning: group.warning
        }))
    )
  )

  const filteredOptions = $derived.by(() => {
    const q = search.trim().toLowerCase()
    if (!q) return flattenedOptions
    return flattenedOptions.filter(
      option =>
        option.model.toLowerCase().includes(q) ||
        option.provider.toLowerCase().includes(q) ||
        option.groupName.toLowerCase().includes(q)
    )
  })

  // Reasoning effort options matching upstream Hermes Desktop
  const effortOptions: { value: ReasoningEffort; label: string }[] = [
    { value: 'none', label: 'Off' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Max' }
  ]

  const thinkingOn = $derived(currentReasoningEffort !== 'none')
  const currentModelButtonLabel = $derived.by(() => {
    const model = currentModelOption?.model ?? currentModelLabel.split(' / ').at(-1) ?? currentModelLabel
    const reasoning = effortOptions.find(option => option.value === currentReasoningEffort)?.label ?? currentReasoningEffort
    return [model, reasoning, currentFastMode ? 'Fast' : ''].filter(Boolean).join(' ')
  })

  function selectModel(key: string): void {
    open = false
    void onModelSelect(key)
  }

  function toggleThinking(): void {
    const next: ReasoningEffort = thinkingOn
      ? 'none'
      : currentReasoningEffort === 'none'
        ? 'medium'
        : currentReasoningEffort
    void onReasoningChange(next)
  }

  function selectEffort(effort: ReasoningEffort): void {
    void onReasoningChange(effort)
  }

  function toggleFast(): void {
    void onFastChange(!currentFastMode)
  }

  function modelTitle(option: ComposerModelOption): string {
    const badges = modelBadges(option as FlattenedOption)
    const suffix = badges.length > 0 ? ` — ${badges.join(', ')}` : ''
    return `${option.provider} / ${option.model}${suffix}`
  }

  function modelBadges(option: FlattenedOption): string[] {
    return [
      option.capabilities?.reasoning ? 'reasoning' : '',
      option.capabilities?.fast ? 'fast' : '',
      option.unavailable ? 'unavailable' : ''
    ].filter(Boolean)
  }

  function optionClass(option: FlattenedOption): string {
    const base =
      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40'
    if (option.current) return `${base} bg-primary/10 text-primary`
    return base
  }

  function toggleClass(on: boolean): string {
    const base =
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40'
    if (on) return `${base} bg-primary`
    return `${base} bg-ink-muted/20`
  }

  function effortClass(active: boolean): string {
    const base = 'rounded-md px-2 py-1 text-[0.68rem] font-medium transition-colors'
    if (active) return `${base} bg-primary/15 text-primary`
    return `${base} text-ink-muted hover:bg-surface-raised`
  }

  function thumbClass(on: boolean): string {
    return `pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
      on ? 'translate-x-4' : 'translate-x-0'
    }`
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="bitch-control-select inline-flex w-auto max-w-none items-center gap-1.5 whitespace-nowrap"
    disabled={isDisabled}
    title={currentModelOption ? modelTitle(currentModelOption as FlattenedOption) : currentModelLabel}
    aria-label="Switch model"
  >
    {#if isLoading}
      <span
        class="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        aria-label="Loading model settings"
      ></span>
    {/if}
    <span class="text-left">{switching ? 'Switching model...' : currentModelButtonLabel}</span>
  </Popover.Trigger>

  <Popover.Content
    class="z-50 w-80 rounded-xl border border-line bg-canvas p-1 shadow-2xl shadow-black/30"
    sideOffset={4}
    align="start"
  >
    <!-- Search input -->
    <div class="px-1 pb-1">
      <input
        class="w-full rounded-lg border-0 bg-surface-raised px-2.5 py-1.5 text-sm text-ink-bright outline-none placeholder:text-ink-muted/60"
        type="text"
        placeholder="Search models..."
        bind:value={search}
      />
    </div>

    <!-- Model list -->
    <div class="max-h-60 overflow-y-auto">
      {#if filteredOptions.length === 0}
        <p class="px-3 py-4 text-center text-xs text-ink-muted">No models found</p>
      {:else}
        {#each modelGroups as group (group.provider)}
          {@const groupOptions = filteredOptions.filter(o => o.provider === group.provider)}
          {#if groupOptions.length > 0}
            <div class="py-0.5">
              <div class="flex items-center gap-1.5 px-2 py-1">
                <span class="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink-muted/70"
                  >{group.name}</span
                >
                {#if group.freeTier}
                  <span
                    class="rounded-sm bg-emerald-500/15 px-1 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-emerald-500"
                    >Free</span
                  >
                {/if}
                {#if group.warning}
                  <span
                    class="rounded-sm bg-amber-500/15 px-1 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-amber-500"
                    >!</span
                  >
                {/if}
              </div>
              {#each groupOptions as option (option.key)}
                {@const badges = modelBadges(option as FlattenedOption)}
                <button
                  class={optionClass(option as FlattenedOption)}
                  disabled={option.unavailable}
                  title={modelTitle(option as FlattenedOption)}
                  onclick={() => selectModel(option.key)}
                >
                  <span class="min-w-0 flex-1 truncate font-mono text-xs">{option.model}</span>
                  {#if option.current}
                    <svg
                      class="h-3.5 w-3.5 shrink-0 text-primary"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  {/if}
                  {#if badges.length > 0}
                    <span class="shrink-0 text-[0.6rem] text-ink-muted/60">{badges.join('\u00b7')}</span>
                  {/if}

                </button>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Divider -->
    <div class="mx-2 my-1 border-t border-line" role="separator"></div>

    <!-- Model controls -->
    <div class="px-1 py-0.5">
      {#if fastSupported}
        <div class="flex items-center justify-between rounded-lg px-2 py-1.5">
          <span class="text-xs font-medium text-ink">Fast</span>
          <button
            class={toggleClass(currentFastMode)}
            role="switch"
            aria-checked={currentFastMode}
            aria-label="Toggle fast mode"
            disabled={fastSwitching || busy}
            onclick={toggleFast}
          >
            <span class={thumbClass(currentFastMode)} aria-hidden="true"></span>
          </button>
        </div>
      {/if}

      <div class="flex items-center justify-between rounded-lg px-2 py-1.5">
        <span class="text-xs font-medium text-ink">Thinking</span>
        <button
          class={toggleClass(thinkingOn)}
          role="switch"
          aria-checked={thinkingOn}
          aria-label="Toggle thinking"
          disabled={!reasoningSupported || reasoningSwitching || busy}
          onclick={toggleThinking}
        >
          <span class={thumbClass(thinkingOn)} aria-hidden="true"></span>
        </button>
      </div>

      {#if thinkingOn}
        <div class="flex flex-wrap gap-1 px-2 pb-1">
          {#each effortOptions.filter(o => o.value !== 'none') as option (option.value)}
            <button
              class={effortClass(currentReasoningEffort === option.value)}
              disabled={reasoningSwitching || !reasoningSupported || busy}
              onclick={() => selectEffort(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
