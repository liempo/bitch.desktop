<script lang="ts">
  import { onMount, tick } from 'svelte'
  import {
    addImageFiles,
    applySlashSuggestion,
    clearComposerAttachments,
    composerForSession,
    composerState,
    currentModelLabel,
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
    slashSuggestions,
    submitPrompt,
    type ComposerSessionState,
    type ReasoningEffort
  } from '$lib/stores/composer.svelte'
  import {
    getQueuedPromptState,
    removeQueuedPrompt,
    shouldAutoDrainOnSettle,
    subscribeQueuedPrompts,
    type QueuedPromptEntry
  } from '$lib/stores/composer-queue'
  import { threadForSession } from '$lib/stores/messages.svelte'
  import { sessionState } from '$lib/stores/session.svelte'
  import ModelPicker from './ModelPicker.svelte'

  interface Props {
    connected?: boolean
    sessionId?: null | string
  }

  let { connected = false, sessionId = null }: Props = $props()

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
  let queuedState = $state<Record<string, QueuedPromptEntry[]>>(getQueuedPromptState())
  let loadedCatalogSessionId: string | null = $state(null)
  let requestedModels = $state(false)
  let autoDrainInFlight = $state(false)
  let lastBusyBySession = $state<Record<string, boolean>>({})

  const composerKey = $derived(sessionId?.trim() || '__new__')
  const composer = $derived(composerState.sessions[composerKey] ?? EMPTY_COMPOSER_SESSION)
  const thread = $derived(threadForSession(sessionId))
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
  const modelGroups = $derived(groupedModelOptions())
  const modelOptions = $derived(modelGroups.flatMap(group => group.options))
  const modelLabel = $derived(currentModelLabel(sessionId))
  const currentModelOption = $derived(modelOptions.find(option => option.current) ?? null)
  const currentReasoningEffort = $derived((thread?.reasoningEffort as ReasoningEffort | undefined) ?? 'medium')
  const currentFastMode = $derived(Boolean(thread?.fast))
  const reasoningSupported = $derived(currentModelOption?.capabilities?.reasoning !== false)
  const fastSupported = $derived(currentModelOption?.capabilities?.fast === true)
  const queueLabel = $derived(queuedPrompts.length === 1 ? '1 queued prompt' : `${queuedPrompts.length} queued prompts`)

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
      void drainNextQueuedPrompt(key).finally(() => {
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

    if (command.startsWith('/') && !busy) {
      await executeSlashCommand(sessionId, command)
      focusTextarea()
      return
    }

    markComposerInterrupted(sessionId, false)
    await submitPrompt(sessionId)
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

  async function handleFileInput(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement

    if (input.files) {
      await addImageFiles(sessionId, input.files)
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
    if (composer.attachments.length === 1) return '1 image attached'
    return `${composer.attachments.length} images attached`
  }
</script>

<section class="border-t border-line bg-canvas p-3" aria-label="Composer">
  <div class="mx-auto max-w-4xl">
    {#if queuedPrompts.length > 0}
      <div class="mb-2 rounded-2xl border border-warning/20 bg-warning/5 p-2" aria-label="Queued prompts">
        <div class="mb-1 flex items-center justify-between px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-warning/80">
          <span>{queueLabel}</span>
          <span>{busy ? 'will drain after current turn' : 'ready to drain'}</span>
        </div>
        <ol class="space-y-1">
          {#each queuedPrompts as entry (entry.id)}
            <li class="flex items-center justify-between gap-3 rounded-xl bg-surface-raised/70 px-3 py-2 text-xs text-ink">
              <span class="min-w-0 flex-1 truncate">
                {entry.text || `${entry.attachments.length} image attachment${entry.attachments.length === 1 ? '' : 's'}`}
              </span>
              <button
                class="bitch-button"
                type="button"
                onclick={() => removeQueueEntry(entry)}
              >
                Remove
              </button>
            </li>
          {/each}
        </ol>
      </div>
    {/if}

    {#if commandSuggestions.length > 0}
      <div class="mb-2 rounded-2xl border border-primary/20 bg-primary/5 p-2" aria-label="Slash command suggestions">
        <div class="mb-1 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary/80">
          Slash commands
        </div>
        <div class="grid gap-1 sm:grid-cols-2">
          {#each commandSuggestions as item (item.command)}
            <button
              class="bitch-button w-full justify-start px-3 py-2 text-left"
              type="button"
              onclick={() => handleSuggestion(item.command)}
            >
              <span class="font-semibold text-primary">{item.command}</span>
              <span class="ml-2 text-ink-muted">{item.description}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if composer.attachments.length > 0}
      <div class="mb-2 flex flex-wrap gap-2" aria-label={attachmentSummary()}>
        {#each composer.attachments as attachment (attachment.id)}
          <div class="flex items-center gap-2 rounded-xl border border-line bg-surface-raised/80 p-1.5 pr-2 text-xs text-ink">
            {#if attachment.previewUrl}
              <img class="h-10 w-10 rounded-lg object-cover" src={attachment.previewUrl} alt="" />
            {/if}
            <div class="min-w-0 max-w-48">
              <p class="truncate font-medium text-ink-bright">{attachment.label}</p>
              <p class="text-[0.65rem] text-ink-muted/70">{attachment.detail}</p>
            </div>
            <button
              class="bitch-button bitch-icon-button"
              type="button"
              onclick={() => removeComposerAttachment(sessionId, attachment.id)}
              aria-label={`Remove ${attachment.label}`}
            >
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="rounded-2xl bg-composer-bg shadow-2xl shadow-black/20">
      <label class="sr-only" for={`composer-${composerKey}`}>Message Hermes</label>
      <textarea
        id={`composer-${composerKey}`}
        class="max-h-55 min-h-24 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-6 text-ink-bright outline-none placeholder:text-ink-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
        bind:this={textareaElement}
        value={composer.draft}
        rows="4"
        placeholder={connected ? 'Type a prompt… Enter sends, Shift+Enter feeds a newline.' : 'Connect to the Hermes gateway before typing.'}
        disabled={!connected}
        oninput={handleDraftInput}
        onkeydown={handleKeydown}
      ></textarea>

      <div class="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3 pb-2">
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <input
            class="hidden"
            bind:this={fileInputElement}
            type="file"
            accept="image/*"
            multiple
            onchange={(event) => void handleFileInput(event)}
          />

          <button
            class="bitch-button bitch-icon-button"
            type="button"
            onclick={handleAttachClick}
            disabled={!canAttach}
            aria-label="Attach image"
            title="Attach image"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>

          {#if composer.attachments.length > 0}
            <button
              class="bitch-button"
              type="button"
              onclick={() => clearComposerAttachments(sessionId)}
            >
              Clear images
            </button>
          {/if}

          {#if composer.commandError}
            <span class="max-w-60 truncate text-xs text-warning" title={composer.commandError}>{composer.commandError}</span>
          {/if}
          {#if composer.error}
            <span class="max-w-60 truncate text-xs text-danger" title={composer.error}>{composer.error}</span>
          {/if}
        </div>

        <div class="flex min-w-0 items-center gap-2">
          <ModelPicker
            busy={busy}
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
            onFastChange={(enabled: boolean) => { void selectComposerFastMode(sessionId, enabled) }}
            onModelSelect={(key: string) => { void selectComposerModel(sessionId, key) }}
            onReasoningChange={(effort: ReasoningEffort) => { void selectComposerReasoningEffort(sessionId, effort) }}
          />

          {#if busy && sessionId}
            <button
              class="bitch-button bitch-icon-button bitch-button-danger"
              type="button"
              onclick={() => void handleInterrupt()}
              disabled={!connected}
              aria-label="Stop"
              title="Stop"
            >
              <span class="bitch-button-stop-glyph"></span>
            </button>
          {/if}

          <button
            class="bitch-button bitch-button-primary"
            type="button"
            onclick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {composer.submitting ? 'Sending…' : busy ? 'Queue' : 'Send'}
          </button>
        </div>
      </div>
    </div>

    {#if composerState.model.error}
      <p class="mt-2 text-xs text-warning">{composerState.model.error}</p>
    {/if}
  </div>
</section>
