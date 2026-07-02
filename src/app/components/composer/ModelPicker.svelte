<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Icon from '@/app/components/ui/Icon.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import TextInput from '@/app/components/ui/TextInput.svelte'
  import { menuItemClass, sectionTitleClass, tagClass } from '@/app/components/ui/styles'
  import type { ComposerModelGroup, ComposerModelOption, ReasoningEffort } from '$lib/hermes/composer'

  interface Props {
    busy?: boolean
    compact?: boolean
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
    compact = false,
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
  const triggerClass = $derived(
    [
      'inline-flex w-auto min-w-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-transparent bg-transparent',
      compact ? 'min-h-6 max-w-32 px-2 py-0 text-[10px]' : 'min-h-8 max-w-none px-3 py-1 text-[11px]',
      'font-mono font-semibold uppercase leading-none tracking-[0.1em] text-ink-muted',
      'hover:bg-primary/10 hover:text-ink-bright',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-ink-muted'
    ].join(' ')
  )
  const contentClass = 'w-[min(40rem,calc(100vw-2rem))]'
  const bodyClass = 'p-2'
  const groupTitleClass = `${sectionTitleClass} text-[0.65rem]`
  const successTagClass = `${tagClass} border-success/45 px-1 py-0.5 text-[0.55rem] text-success`
  const warningTagClass = `${tagClass} border-warning/45 px-1 py-0.5 text-[0.55rem] text-warning`

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
      `${menuItemClass} flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40`
    if (option.current) return `${base} border-primary/40 bg-primary/10 text-primary`
    return base
  }

  function toggleClass(on: boolean): string {
    const base =
      'relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-control border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40'
    if (on) return `${base} border-primary/60 bg-primary/20`
    return `${base} bg-surface-raised`
  }

  function thumbClass(on: boolean): string {
    return `pointer-events-none inline-block h-3.5 w-3.5 rounded-xs bg-ink-bright ${
      on ? 'translate-x-5 bg-primary' : 'translate-x-0 bg-ink-muted'
    }`
  }
</script>

<button
  type="button"
  class={triggerClass}
  disabled={isDisabled}
  title={currentModelOption ? modelTitle(currentModelOption as FlattenedOption) : currentModelLabel}
  aria-label="Switch model"
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={() => (open = true)}
>
  {#if isLoading}
    <Loader size="sm" label="Loading model settings" />
  {/if}
  <span class="min-w-0 truncate text-left">{switching ? 'Switching model' : currentModelButtonLabel}</span>
</button>

<Dialog
  bind:open
  title="Model Settings"
  description="switch model, fast mode, and reasoning effort"
  class={contentClass}
  contentClass={bodyClass}
>
  <!-- Search input -->
  <div class="px-1 pb-1">
    <TextInput
      class="px-2.5 py-1.5 text-sm"
      type="text"
      placeholder="grep models"
      bind:value={search}
    />
  </div>

  <!-- Model list -->
  <div class="max-h-[min(24rem,calc(100vh-16rem))] overflow-y-auto">
    {#if filteredOptions.length === 0}
      <p class="px-3 py-4 text-center text-xs text-ink-muted">No models found</p>
    {:else}
      {#each modelGroups as group (group.provider)}
        {@const groupOptions = filteredOptions.filter(o => o.provider === group.provider)}
        {#if groupOptions.length > 0}
          <div class="py-0.5">
            <div class="flex items-center gap-1.5 px-2 py-1">
              <span class={groupTitleClass}
                >{group.name}</span
              >
              {#if group.freeTier}
                <span
                  class={successTagClass}
                  >Free</span
                >
              {/if}
              {#if group.warning}
                <span class={warningTagClass}>
                  <Icon name="warning" label={group.warning} decorative={false} />
                </span>
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
                  <Icon name="check" class="h-3.5 w-3.5 text-primary" />
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
      <div class="flex items-center justify-between rounded-control px-2 py-1.5">
        <span class="text-xs font-semibold uppercase tracking-[0.12em] text-ink">Fast</span>
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

    <div class="flex items-center justify-between rounded-control px-2 py-1.5">
      <span class="text-xs font-semibold uppercase tracking-[0.12em] text-ink">Thinking</span>
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
          <Button
            chrome="ghost"
            variant={currentReasoningEffort === option.value ? 'primary' : 'default'}
            size="sm"
            class="min-h-0 px-2 py-1 text-[0.68rem]"
            disabled={reasoningSwitching || !reasoningSupported || busy}
            onclick={() => selectEffort(option.value)}
          >
            {option.label}
          </Button>
        {/each}
      </div>
    {/if}
  </div>
</Dialog>
