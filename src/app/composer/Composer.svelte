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
    flattenedModelOptions,
    interruptComposerSession,
    loadCommandCatalog,
    markComposerInterrupted,
    refreshComposerModels,
    removeComposerAttachment,
    selectComposerModel,
    setComposerDraft,
    slashSuggestions,
    submitPrompt,
    type ComposerSessionState
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
  // Queue and live operations key on the short live session ID (activeSessionId),
  // NOT on the URL hash (which holds the stored key for page-refresh resilience).
  const liveSid = $derived(sessionState.activeSessionId)
  const queueKey = $derived(liveSid?.trim() || null)
  const queuedPrompts = $derived(queueKey ? (queuedState[queueKey] ?? []) : [])
  const hasDraftPayload = $derived(Boolean(composer.draft.trim() || composer.attachments.length))
  const canSubmit = $derived(connected && hasDraftPayload && !composer.submitting)
  const canAttach = $derived(connected && !composer.submitting)
  const commandSuggestions = $derived(sessionId ? slashSuggestions(sessionId, composer.draft) : [])
  const modelOptions = $derived(flattenedModelOptions())
  const modelLabel = $derived(currentModelLabel(sessionId))
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
    if (!connected || !sessionId) return

    if (loadedCatalogSessionId !== sessionId) {
      loadedCatalogSessionId = sessionId
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
    // Use the short live session ID for slash commands and prompt
    // submission — the gateway's _sess_nowait requires the short sid.
    const targetId = liveSid

    if (command.startsWith('/') && targetId && !busy) {
      await executeSlashCommand(targetId, command)
      focusTextarea()
      return
    }

    markComposerInterrupted(sessionId, false)
    await submitPrompt(targetId)
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

  async function handleModelChange(event: Event): Promise<void> {
    const select = event.currentTarget as HTMLSelectElement
    const key = select.value

    if (!key) return

    await selectComposerModel(liveSid, key)
    select.value = ''
  }

  async function handleInterrupt(): Promise<void> {
    await interruptComposerSession(liveSid)
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

<section class="border-t border-slate-800 bg-slate-950/90 p-4" aria-label="Composer">
  <div class="mx-auto max-w-4xl">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <div class="flex min-w-0 items-center gap-2">
        <span class="rounded-full border border-slate-800 bg-slate-900/80 px-2 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
          Composer
        </span>
        <span class="truncate" title={modelLabel}>{modelLabel}</span>
        {#if composerState.model.loading}
          <span class="text-slate-600">loading models…</span>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        {#if composer.commandError}
          <span class="max-w-72 truncate text-amber-300" title={composer.commandError}>{composer.commandError}</span>
        {/if}
        {#if composer.error}
          <span class="max-w-72 truncate text-red-300" title={composer.error}>{composer.error}</span>
        {/if}
      </div>
    </div>

    {#if queuedPrompts.length > 0}
      <div class="mb-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-2" aria-label="Queued prompts">
        <div class="mb-1 flex items-center justify-between px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
          <span>{queueLabel}</span>
          <span>{busy ? 'will drain after current turn' : 'ready to drain'}</span>
        </div>
        <ol class="space-y-1">
          {#each queuedPrompts as entry (entry.id)}
            <li class="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
              <span class="min-w-0 flex-1 truncate">
                {entry.text || `${entry.attachments.length} image attachment${entry.attachments.length === 1 ? '' : 's'}`}
              </span>
              <button
                class="rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
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
      <div class="mb-2 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-2" aria-label="Slash command suggestions">
        <div class="mb-1 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sky-200/80">
          Slash commands
        </div>
        <div class="grid gap-1 sm:grid-cols-2">
          {#each commandSuggestions as item (item.command)}
            <button
              class="rounded-xl px-3 py-2 text-left text-xs transition hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              type="button"
              onclick={() => handleSuggestion(item.command)}
            >
              <span class="font-semibold text-sky-200">{item.command}</span>
              <span class="ml-2 text-slate-500">{item.description}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if composer.attachments.length > 0}
      <div class="mb-2 flex flex-wrap gap-2" aria-label={attachmentSummary()}>
        {#each composer.attachments as attachment (attachment.id)}
          <div class="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-1.5 pr-2 text-xs text-slate-300">
            {#if attachment.previewUrl}
              <img class="h-10 w-10 rounded-lg object-cover" src={attachment.previewUrl} alt="" />
            {/if}
            <div class="min-w-0 max-w-48">
              <p class="truncate font-medium text-slate-200">{attachment.label}</p>
              <p class="text-[0.65rem] text-slate-600">{attachment.detail}</p>
            </div>
            <button
              class="rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
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

    <div class="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-2xl shadow-black/20 focus-within:border-sky-500/40 focus-within:ring-2 focus-within:ring-sky-500/10">
      <label class="sr-only" for={`composer-${composerKey}`}>Message Hermes</label>
      <textarea
        id={`composer-${composerKey}`}
        class="max-h-55 min-h-12 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        bind:this={textareaElement}
        value={composer.draft}
        rows="1"
        placeholder={connected ? 'Type a prompt… Enter sends, Shift+Enter feeds a newline.' : 'Connect to the Hermes gateway before typing.'}
        disabled={!connected}
        oninput={handleDraftInput}
        onkeydown={handleKeydown}
      ></textarea>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-3 py-2">
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="hidden"
            bind:this={fileInputElement}
            type="file"
            accept="image/*"
            multiple
            onchange={(event) => void handleFileInput(event)}
          />

          <button
            class="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onclick={handleAttachClick}
            disabled={!canAttach}
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636 7.05 16.95a3 3 0 0 0 4.243 4.243l11.314-11.314a5 5 0 1 0-7.071-7.071L4.222 14.12a7 7 0 0 0 9.9 9.9l9.193-9.192" />
            </svg>
            Image
          </button>

          {#if composer.attachments.length > 0}
            <button
              class="rounded-xl px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
              type="button"
              onclick={() => clearComposerAttachments(sessionId)}
            >
              Clear images
            </button>
          {/if}

          <select
            class="max-w-72 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 outline-none transition hover:border-slate-600 focus:border-sky-500/60 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Switch model"
            onchange={(event) => void handleModelChange(event)}
            disabled={!connected || !sessionId || composerState.model.switching || modelOptions.length === 0}
          >
            <option value="">{composerState.model.switching ? 'Switching model…' : modelLabel}</option>
            {#each modelOptions as option (option.key)}
              <option value={option.key}>{option.provider} / {option.model}{option.current ? ' ✓' : ''}</option>
            {/each}
          </select>
        </div>

        <div class="flex items-center gap-2">
          {#if busy && sessionId}
            <button
              class="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              onclick={() => void handleInterrupt()}
              disabled={!connected}
            >
              Stop
            </button>
          {/if}

          <button
            class="rounded-xl border border-sky-400/40 bg-sky-400/15 px-4 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40"
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
      <p class="mt-2 text-xs text-amber-300">{composerState.model.error}</p>
    {/if}
  </div>
</section>
