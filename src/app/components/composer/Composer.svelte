<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Popover } from 'bits-ui'
  import {
    addAttachmentFiles,
    applySlashSuggestion,
    clearComposerAttachments,
    composerForSession,
    composerState,
    currentFastModeForSession,
    currentModelLabel,
    currentReasoningEffortForSession,
    drainNextQueuedPrompt,
    executeSlashCommand,
    groupedModelOptions,
    interruptComposerSession,
    loadCommandCatalog,
    markComposerInterrupted,
    refreshComposerModels,
    removeComposerAttachment,
    selectComposerFastMode,
    selectComposerModel,
    selectComposerReasoningEffort,
    setComposerDraft,
    shouldDispatchSlashImmediately,
    slashSuggestions,
    submitPrompt,
    type ComposerSessionState,
    type ReasoningEffort
  } from '$lib/hermes/composer'
  import {
    getQueuedPromptState,
    removeQueuedPrompt,
    shouldAutoDrainOnSettle,
    subscribeQueuedPrompts,
    type QueuedPromptEntry
  } from '$lib/hermes/composer'
  import { threadForSession } from '$lib/hermes/threads'
  import {
    normalizeProfileKey,
    profileState,
    selectNewSessionProfile,
    sortByProfileOrder
  } from '$lib/hermes/profiles'
  import { sessionState } from '$lib/hermes/sessions'
  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { cardClass, menuItemClass, popoverClass, terminalClass, textareaClass } from '@/app/components/ui/styles'
  import ModelPicker from './ModelPicker.svelte'
  import type { ProfileInfo } from '$lib/types/hermes'

  interface Props {
    commitRoute?: boolean
    compact?: boolean
    connected?: boolean
    onToggleSidebar?: () => void
    profileName?: null | string
    responsiveCompact?: boolean
    sidebarOpen?: boolean
    sessionId?: null | string
    sessionTitle?: string
  }

  interface ProfileChoice {
    isDefault: boolean
    name: string
  }

  let {
    commitRoute = true,
    compact = false,
    connected = false,
    onToggleSidebar,
    profileName = 'default',
    responsiveCompact = false,
    sidebarOpen = true,
    sessionId = null,
    sessionTitle = 'New session'
  }: Props = $props()

  const EMPTY_COMPOSER_SESSION: ComposerSessionState = {
    attachments: [],
    commandCatalog: [],
    commandError: null,
    draft: '',
    error: null,
    loadingCommands: false,
    submitting: false,
    userInterrupted: false
  }

  let textareaElement: HTMLTextAreaElement | null = $state(null)
  let fileInputElement: HTMLInputElement | null = $state(null)
  let profileMenuOpen = $state(false)
  let queuedState = $state<Record<string, QueuedPromptEntry[]>>(getQueuedPromptState())
  let loadedCatalogSessionId: string | null = $state(null)
  let requestedModels = $state(false)
  let autoDrainInFlight = $state(false)
  let lastBusyBySession = $state<Record<string, boolean>>({})

  const composerKey = $derived(sessionId?.trim() || '__new__')
  const composer = $derived(composerState.sessions[composerKey] ?? EMPTY_COMPOSER_SESSION)
  const thread = $derived(threadForSession(sessionId))
  const selectedSessionInfo = $derived(
    sessionId ? (sessionState.sessions.find(session => session.id === sessionId) ?? null) : null
  )
  const busy = $derived(Boolean(thread?.busy))
  // Composer UI state, drafts, and queueing key by the selected stored route id.
  // The live sid is only for RPC calls and is derived inside composer store helpers.
  const liveSid = $derived(sessionState.activeSessionId)
  const queueKey = $derived(sessionId?.trim() || null)
  const queuedPrompts = $derived(queueKey ? (queuedState[queueKey] ?? []) : [])
  const hasDraftPayload = $derived(Boolean(composer.draft.trim() || composer.attachments.length))
  const canSubmit = $derived(connected && hasDraftPayload && !composer.submitting && (!sessionId || Boolean(liveSid)))
  const canAttach = $derived(connected && !composer.submitting)
  const commandSuggestions = $derived(sessionId ? slashSuggestions(sessionId, composer.draft) : [])
  const modelGroups = $derived(groupedModelOptions(sessionId))
  const modelOptions = $derived(modelGroups.flatMap(group => group.options))
  const modelLabel = $derived(currentModelLabel(sessionId))
  const currentModelOption = $derived(modelOptions.find(option => option.current) ?? null)
  const currentReasoningEffort = $derived(currentReasoningEffortForSession(sessionId))
  const currentFastMode = $derived(currentFastModeForSession(sessionId))
  const panelTitle = $derived(sessionTitle.trim() || 'New session')
  const activeProfileName = $derived(normalizeProfileKey(profileName))
  const profileLabel = $derived(activeProfileName)
  const sessionHasMessages = $derived(
    Boolean(sessionId && ((selectedSessionInfo?.message_count ?? 0) > 0 || (thread?.messages.length ?? 0) > 0))
  )
  const canChangeProfile = $derived(connected && !sessionId && !composer.submitting)
  const profileMenuChoices = $derived(profileChoicesFor(profileState.profiles, activeProfileName))
  const profileTriggerTitle = $derived(
    canChangeProfile
      ? 'Choose profile for the next session'
      : sessionHasMessages
        ? 'Profile is locked after a session has messages'
        : 'Profile can only be changed before creating a session'
  )
  const reasoningSupported = $derived(currentModelOption?.capabilities?.reasoning !== false)
  const fastSupported = $derived(currentModelOption?.capabilities?.fast === true)
  const queueLabel = $derived(queuedPrompts.length === 1 ? '1 queued prompt' : `${queuedPrompts.length} queued prompts`)
  const queueCardClass = `${cardClass} mb-2 border-warning/30 !bg-warning/5 p-2`
  const suggestionCardClass = `${cardClass} mb-2 border-primary/30 !bg-primary/5 p-2`
  const queueItemClass = `${terminalClass} flex items-center justify-between gap-3 px-3 py-2 text-xs text-ink`
  const attachmentCardClass = `${cardClass} flex items-center gap-2 p-1.5 pr-2 text-xs text-ink`
  const composerShellClass = $derived(
    compact
      ? 'shrink-0 bg-surface-raised/35 p-2'
      : responsiveCompact
        ? 'shrink-0 bg-surface-raised/35 p-2 md:bg-transparent md:p-3'
        : 'p-3'
  )
  const composerInnerClass = $derived(compact ? 'w-full' : responsiveCompact ? 'w-full md:mx-auto md:max-w-5xl' : 'mx-auto max-w-5xl')
  const composerFrameClass = $derived(compact ? 'mt-0' : responsiveCompact ? 'mt-0 md:mt-3' : 'mt-3')
  const composerPanelClass = $derived(compact ? 'border-line bg-input' : responsiveCompact ? 'border-line bg-input md:bg-surface' : '')
  const composerTextareaClass = $derived(
    `${textareaClass} border-0 !bg-transparent text-ink-bright placeholder:text-ink-muted/70 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
      compact
        ? 'max-h-32 min-h-14 px-3 pt-2 pb-1 text-[0.76rem] leading-5'
        : responsiveCompact
          ? 'max-h-32 min-h-14 px-3 pt-2 pb-1 text-[0.76rem] leading-5 md:max-h-55 md:min-h-24 md:px-4 md:pt-3 md:pb-2 md:text-sm md:leading-6'
          : 'max-h-55 min-h-24 px-4 pt-3 pb-2 text-sm leading-6'
    }`
  )
  const composerControlsClass = $derived(
    compact
      ? 'flex min-h-10 flex-wrap items-center justify-between gap-2 px-2 py-1.5'
      : responsiveCompact
        ? 'flex min-h-10 flex-wrap items-center justify-between gap-2 px-2 py-1.5 md:min-h-12 md:px-3 md:py-2'
        : 'flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2'
  )
  const composerErrorClass = $derived(
    compact ? 'max-w-44 truncate text-[0.65rem]' : responsiveCompact ? 'max-w-44 truncate text-[0.65rem] md:max-w-60 md:text-xs' : 'max-w-60 truncate text-xs'
  )
  const profileTriggerClass = [
    'font-mono text-[11px] font-bold uppercase tracking-[0.05em]',
    'text-ink-muted hover:text-ink-bright',
    'before:mr-1 before:text-line-strong before:content-[\'[\'] after:ml-1 after:text-line-strong after:content-[\']\']',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-ink-muted'
  ].join(' ')
  const profileMenuContentClass = `${popoverClass} z-50 w-60 p-1.5 font-mono`
  const profileMenuItemBaseClass = `${menuItemClass} flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] uppercase tracking-[0.08em]`

  onMount(() =>
    subscribeQueuedPrompts(state => {
      queuedState = state
    })
  )

  $effect(() => {
    composerForSession(sessionId)
  })

  $effect(() => {
    if (!connected) return

    if (!requestedModels) {
      requestedModels = true
      void refreshComposerModels()
    }
  })

  $effect(() => {
    if (!connected || !sessionId || !liveSid) return

    const catalogKey = `${sessionId}:${liveSid}`
    if (loadedCatalogSessionId !== catalogKey) {
      loadedCatalogSessionId = catalogKey
      void loadCommandCatalog(sessionId)
    }
  })

  $effect(() => {
    const draftSnapshot = composer.draft

    void tick().then(() => {
      if (draftSnapshot === composer.draft) resizeTextarea()
    })
  })

  $effect(() => {
    const key = queueKey
    if (!key) return

    const isBusy = busy
    const wasBusy = lastBusyBySession[key] ?? false
    const queueLength = queuedPrompts.length
    const userInterrupted = composer.userInterrupted

    if (
      !autoDrainInFlight &&
      shouldAutoDrainOnSettle({
        isBusy,
        queueLength,
        userInterrupted,
        wasBusy
      })
    ) {
      autoDrainInFlight = true
      void drainNextQueuedPrompt(key, { commitRoute }).finally(() => {
        autoDrainInFlight = false
      })
    }

    lastBusyBySession[key] = isBusy
  })

  function resizeTextarea(): void {
    if (!textareaElement) return

    textareaElement.style.height = '0px'
    textareaElement.style.height = `${Math.min(textareaElement.scrollHeight, 220)}px`
  }

  function focusTextarea(): void {
    void tick().then(() => textareaElement?.focus())
  }

  function handleDraftInput(event: Event): void {
    setComposerDraft(sessionId, (event.currentTarget as HTMLTextAreaElement).value)
  }

  async function handleSubmit(): Promise<void> {
    if (!connected || !hasDraftPayload || composer.submitting) return

    const command = composer.draft.trim()
    // Store helpers keep UI state under the stored route key and send live
    // RPCs with sessionState.activeSessionId. If a selected session is still
    // resuming, do not submit into the previously selected live session.
    if (sessionId && !liveSid) return

    if (shouldDispatchSlashImmediately(command, busy)) {
      await executeSlashCommand(sessionId, command, { commitRoute })
      focusTextarea()
      return
    }

    markComposerInterrupted(sessionId, false)
    await submitPrompt(sessionId, { commitRoute })
    focusTextarea()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return

    event.preventDefault()
    void handleSubmit()
  }

  function handleAttachClick(): void {
    fileInputElement?.click()
  }

  function profileChoicesFor(profiles: ProfileInfo[], currentProfile: string): ProfileChoice[] {
    const defaults = profiles.filter(profile => profile.is_default)
    const rest = sortByProfileOrder(profiles.filter(profile => !profile.is_default))
    const choices = [...defaults, ...rest].map(profile => ({ isDefault: profile.is_default, name: profile.name }))
    const seen = new Set(choices.map(choice => normalizeProfileKey(choice.name)))
    const current = normalizeProfileKey(currentProfile)

    if (!seen.has(current)) {
      choices.unshift({ isDefault: current === 'default', name: current })
    }

    return choices.length > 0 ? choices : [{ isDefault: true, name: 'default' }]
  }

  function profileChoiceLabel(profile: ProfileChoice): string {
    return profile.isDefault || normalizeProfileKey(profile.name) === 'default' ? 'default' : profile.name
  }

  function profileChoiceClass(profile: ProfileChoice): string {
    const selected = normalizeProfileKey(profile.name) === activeProfileName
    return selected ? `${profileMenuItemBaseClass} border-primary/40 bg-primary/10 text-primary` : profileMenuItemBaseClass
  }

  function handleProfileSelect(profile: string): void {
    if (!canChangeProfile) return

    selectNewSessionProfile(profile)
    profileMenuOpen = false
  }

  async function handleFileInput(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement

    if (input.files) {
      await addAttachmentFiles(sessionId, input.files)
      input.value = ''
      focusTextarea()
    }
  }

  function handleSuggestion(command: string): void {
    applySlashSuggestion(sessionId, command)
    focusTextarea()
  }

  async function handleInterrupt(): Promise<void> {
    await interruptComposerSession(sessionId)
  }

  function removeQueueEntry(entry: QueuedPromptEntry): void {
    if (!queueKey) return

    removeQueuedPrompt(queueKey, entry.id)
  }

  function attachmentSummary(): string {
    if (composer.attachments.length === 0) return 'No attachments'
    if (composer.attachments.length === 1) return '1 attachment'
    return `${composer.attachments.length} attachments`
  }
</script>

<section class={composerShellClass} data-selectable="true" aria-label={compact ? 'Mini composer' : 'Composer'}>
  <div class={composerInnerClass}>
    {#if queuedPrompts.length > 0}
      <div class={queueCardClass} aria-label="Queued prompts">
        <div class="mb-1 flex items-center justify-between px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-warning/80">
          <span>{queueLabel}</span>
          <span>{busy ? 'will drain after current turn' : 'ready to drain'}</span>
        </div>
        <ol class="space-y-1">
          {#each queuedPrompts as entry (entry.id)}
            <li class={queueItemClass}>
              <span class="min-w-0 flex-1 truncate">
                {entry.text || `${entry.attachments.length} attachment${entry.attachments.length === 1 ? '' : 's'}`}
              </span>
              <Button
                chrome="ghost"
                size="sm"
                onclick={() => removeQueueEntry(entry)}
              >
                Remove
              </Button>
            </li>
          {/each}
        </ol>
      </div>
    {/if}

    {#if commandSuggestions.length > 0}
      <div class={suggestionCardClass} aria-label="Slash command suggestions">
        <div class="mb-1 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary/80">
          Slash commands
        </div>
        <div class="grid gap-1 sm:grid-cols-2">
          {#each commandSuggestions as item (item.command)}
            <Button
              chrome="ghost"
              class="w-full justify-start px-3 py-2 text-left"
              onclick={() => handleSuggestion(item.command)}
            >
              <span class="font-semibold text-primary">{item.command}</span>
              <span class="ml-2 text-ink-muted">{item.description}</span>
            </Button>
          {/each}
        </div>
      </div>
    {/if}

    {#if composer.attachments.length > 0}
      <div class="mb-2 flex flex-wrap gap-2" aria-label={attachmentSummary()}>
        {#each composer.attachments as attachment (attachment.id)}
          <div class={attachmentCardClass}>
            {#if attachment.previewUrl}
              <img class="h-10 w-10 rounded-control object-cover" src={attachment.previewUrl} alt="" />
            {:else if attachment.kind === 'pdf'}
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-[10px] font-bold uppercase tracking-[0.12em] text-danger">
                PDF
              </div>
            {:else if attachment.kind === 'audio'}
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-[10px] font-bold uppercase tracking-[0.12em] text-success">
                AUD
              </div>
            {:else if attachment.kind === 'video'}
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                VID
              </div>
            {:else}
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                FILE
              </div>
            {/if}
            <div class="min-w-0 max-w-48">
              <p class="truncate font-medium text-ink-bright">{attachment.label}</p>
              <p class="text-[0.65rem] text-ink-muted/70">{attachment.detail}</p>
            </div>
            <Button
              chrome="ghost"
              size="icon"
              onclick={() => removeComposerAttachment(sessionId, attachment.id)}
              aria-label={`Remove ${attachment.label}`}
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        {/each}
      </div>
    {/if}

    <div class={composerFrameClass}>
      <Panel title={panelTitle} padded={false} class={composerPanelClass}>
        {#snippet leading()}
          {#if onToggleSidebar}
            <Button
              variant="unstyled"
              class="hidden h-5 w-5 items-center justify-center p-0 text-ink-muted hover:text-ink-bright md:flex"
              onclick={onToggleSidebar}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M5 12h14M5 17h14" />
              </svg>
            </Button>
          {/if}
        {/snippet}

        {#snippet actions()}
          <Popover.Root bind:open={profileMenuOpen}>
            <Popover.Trigger
              class={profileTriggerClass}
              disabled={!canChangeProfile}
              title={profileTriggerTitle}
              aria-label="Choose session profile"
            >
              profile:{profileLabel}
            </Popover.Trigger>

            <Popover.Content class={profileMenuContentClass} sideOffset={4} align="end">
              <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                new session profile
              </div>
              <div class="grid gap-1">
                {#each profileMenuChoices as profile (profile.name)}
                  {@const selected = normalizeProfileKey(profile.name) === activeProfileName}
                  <button
                    class={profileChoiceClass(profile)}
                    type="button"
                    onclick={() => handleProfileSelect(profile.name)}
                    aria-pressed={selected}
                  >
                    <span class="min-w-0 truncate">profile:{profileChoiceLabel(profile)}</span>
                    {#if selected}
                      <span class="shrink-0 text-primary">active</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </Popover.Content>
          </Popover.Root>
        {/snippet}

        <div class="p-0">
          <label class="sr-only" for={`composer-${composerKey}`}>Message Hermes</label>
          <textarea
            id={`composer-${composerKey}`}
            class={composerTextareaClass}
            bind:this={textareaElement}
            value={composer.draft}
            rows={compact || responsiveCompact ? 2 : 4}
            placeholder={connected ? 'type prompt :: Enter sends / Shift+Enter inserts newline' : 'link_down :: connect to Hermes gateway before typing'}
            disabled={!connected}
            oninput={handleDraftInput}
            onkeydown={handleKeydown}
          ></textarea>

          <div class={composerControlsClass}>
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <input
                class="hidden"
                bind:this={fileInputElement}
                type="file"
                multiple
                onchange={(event) => void handleFileInput(event)}
              />

              <Button
                chrome="ghost"
                size="icon"
                onclick={handleAttachClick}
                disabled={!canAttach}
                aria-label="Attach file"
                title="Attach file"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </Button>

              {#if composer.attachments.length > 0}
                <Button
                  chrome="ghost"
                  onclick={() => clearComposerAttachments(sessionId)}
                >
                  Clear attachments
                </Button>
              {/if}

              {#if composer.commandError}
                <span class={`${composerErrorClass} text-warning`} title={composer.commandError}>{composer.commandError}</span>
              {/if}
              {#if composer.error}
                <span class={`${composerErrorClass} text-danger`} title={composer.error}>{composer.error}</span>
              {/if}
            </div>

            <div class="flex min-w-0 items-center gap-2">
              <ModelPicker
                busy={busy}
                compact={compact}
                connected={connected}
                currentFastMode={currentFastMode}
                currentModelLabel={modelLabel}
                currentModelOption={currentModelOption}
                currentReasoningEffort={currentReasoningEffort}
                fastSupported={fastSupported}
                fastSwitching={composerState.model.fastSwitching}
                modelGroups={modelGroups}
                modelLoading={composerState.model.loading}
                reasoningSupported={reasoningSupported}
                reasoningSwitching={composerState.model.reasoningSwitching}
                switching={composerState.model.switching}
                onFastChange={(enabled: boolean) => { void selectComposerFastMode(sessionId, enabled, { commitRoute }) }}
                onModelSelect={(key: string) => { void selectComposerModel(sessionId, key, { commitRoute }) }}
                onReasoningChange={(effort: ReasoningEffort) => { void selectComposerReasoningEffort(sessionId, effort, { commitRoute }) }}
              />

              {#if busy && sessionId}
                <Button
                  chrome="ghost"
                  variant="danger"
                  size="icon"
                  onclick={() => void handleInterrupt()}
                  disabled={!connected}
                  aria-label="Stop"
                  title="Stop"
                >
                  <span class="h-2.5 w-2.5 rounded-xs bg-current"></span>
                </Button>
              {/if}

              <Button
                chrome="ghost"
                variant="primary"
                size={compact || responsiveCompact ? 'sm' : 'md'}
                onclick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {composer.submitting ? 'Sending' : busy ? 'Queue' : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>

    {#if composerState.model.error}
      <p class="mt-2 text-xs text-warning">{composerState.model.error}</p>
    {/if}
  </div>
</section>
