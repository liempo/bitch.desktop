<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Popover } from 'bits-ui'
  import { getElevenLabsVoices, speakText, transcribeAudio, type ElevenLabsVoice } from '$lib/api/audio'
  import {
    assistantTextForSpeech,
    mergeTranscriptIntoDraft,
    preferredRecordingMimeType,
    voiceOptionLabel
  } from '$lib/audio/voice'
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
  } from '$lib/stores/composer.svelte'
  import {
    getQueuedPromptState,
    removeQueuedPrompt,
    shouldAutoDrainOnSettle,
    subscribeQueuedPrompts,
    type QueuedPromptEntry
  } from '$lib/stores/composer-queue'
  import { threadForSession } from '$lib/stores/messages.svelte'
  import {
    normalizeProfileKey,
    profileState,
    selectNewSessionProfile,
    sortByProfileOrder
  } from '$lib/stores/profile.svelte'
  import { sessionState } from '$lib/stores/session.svelte'
  import Button from '@/components/ui/Button.svelte'
  import Panel from '@/components/ui/Panel.svelte'
  import { cardClass, inputClass, menuItemClass, popoverClass, terminalClass, textareaClass } from '@/components/ui/styles'
  import ModelPicker from './ModelPicker.svelte'
  import type { ProfileInfo } from '$lib/types/hermes'

  interface Props {
    connected?: boolean
    onToggleSidebar?: () => void
    profileName?: null | string
    sidebarOpen?: boolean
    sessionId?: null | string
    sessionTitle?: string
  }

  interface ProfileChoice {
    isDefault: boolean
    name: string
  }

  let {
    connected = false,
    onToggleSidebar,
    profileName = 'default',
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
  let mediaRecorder: MediaRecorder | null = null
  let mediaStream: MediaStream | null = null
  let recordedAudioChunks: Blob[] = []
  let discardVoiceRecording = false
  let voiceRecording = $state(false)
  let voiceTranscribing = $state(false)
  let voiceConversationEnabled = $state(false)
  let voiceError: null | string = $state(null)
  let voicePlaybackStatus: null | string = $state(null)
  let selectedVoiceId = $state('')
  let voiceChoices: ElevenLabsVoice[] = $state([])
  let voiceChoicesAvailable = $state(false)
  let voiceChoicesLoadedProfile: null | string = $state(null)
  let voiceChoicesLoading = $state(false)
  let lastSpokenAssistantId: null | string = $state(null)
  let currentSpeechAudio: HTMLAudioElement | null = null

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
  const composerTextareaClass = `${textareaClass} max-h-55 min-h-24 border-0 !bg-transparent px-4 pt-3 pb-2 text-sm leading-6 text-ink-bright placeholder:text-ink-muted/70 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50`
  const profileTriggerClass = [
    'font-mono text-[11px] font-bold uppercase tracking-[0.05em]',
    'text-ink-muted hover:text-ink-bright',
    'before:mr-1 before:text-line-strong before:content-[\'[\'] after:ml-1 after:text-line-strong after:content-[\']\']',
    'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:text-ink-muted'
  ].join(' ')
  const profileMenuContentClass = `${popoverClass} z-50 w-60 p-1.5 font-mono`
  const profileMenuItemBaseClass = `${menuItemClass} flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] uppercase tracking-[0.08em]`
  const voiceSelectClass = `${inputClass} min-h-8 w-42 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em]`
  const VOICE_CHOICES_SOURCE = '/api/audio/elevenlabs/voices'
  const canRecordVoice = $derived(connected && !composer.submitting && !voiceTranscribing && (voiceRecording || !busy))
  const voiceStatusMessage = $derived(
    voiceError ??
      (voiceRecording
        ? 'recording voice'
        : voiceTranscribing
          ? 'transcribing voice'
          : voicePlaybackStatus)
  )
  const voiceStatusClass = $derived(voiceError ? 'max-w-60 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-danger' : 'max-w-60 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-success')

  onMount(() =>
    subscribeQueuedPrompts(state => {
      queuedState = state
    })
  )

  onMount(() => () => {
    stopVoiceResources()
  })

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
    if (!connected) return

    const profile = activeProfileName
    if (voiceChoicesLoading || voiceChoicesLoadedProfile === profile) return

    voiceChoicesLoading = true
    void getElevenLabsVoices(profile)
      .then(result => {
        voiceChoices = result.voices ?? []
        voiceChoicesAvailable = result.available && voiceChoices.length > 0
        if (!voiceChoices.some(voice => voice.voice_id === selectedVoiceId)) {
          selectedVoiceId = ''
        }
        voiceChoicesLoadedProfile = profile
      })
      .catch(error => {
        voiceChoices = []
        voiceChoicesAvailable = false
        voiceError = inlineVoiceError(error, 'Could not load voice choices')
        voiceChoicesLoadedProfile = profile
      })
      .finally(() => {
        voiceChoicesLoading = false
      })
  })

  $effect(() => {
    if (!voiceConversationEnabled) {
      stopCurrentSpeechAudio()
      return
    }

    const latestAssistant = [...(thread?.messages ?? [])].reverse().find(message => message.role === 'assistant')
    if (!latestAssistant || latestAssistant.id === lastSpokenAssistantId) return

    const text = assistantTextForSpeech(latestAssistant)
    if (!text) return

    lastSpokenAssistantId = latestAssistant.id
    void playSpokenResponse(text)
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

  function inlineVoiceError(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
  }

  function stopVoiceStream(): void {
    mediaStream?.getTracks().forEach(track => track.stop())
    mediaStream = null
  }

  function stopCurrentSpeechAudio(): void {
    if (!currentSpeechAudio) return

    currentSpeechAudio.pause()
    currentSpeechAudio.removeAttribute('src')
    currentSpeechAudio.load()
    currentSpeechAudio = null
  }

  function stopVoiceResources(): void {
    discardVoiceRecording = true
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    mediaRecorder = null
    recordedAudioChunks = []
    voiceRecording = false
    stopVoiceStream()
    stopCurrentSpeechAudio()
  }

  function recordingOptions(): { mimeType?: string } | undefined {
    const mimeType = preferredRecordingMimeType({
      MediaRecorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder
    })

    return mimeType ? { mimeType } : undefined
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
        } else {
          reject(new Error('Could not read voice recording'))
        }
      })
      reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read voice recording')))
      reader.readAsDataURL(blob)
    })
  }

  async function transcribeVoiceChunks(chunks: Blob[], mimeType: string): Promise<void> {
    if (chunks.length === 0) {
      voiceError = 'No audio captured'
      return
    }

    voiceTranscribing = true
    voiceError = null

    try {
      const audioMimeType = mimeType || 'audio/webm'
      const dataUrl = await blobToDataUrl(new Blob(chunks, { type: audioMimeType }))
      const result = await transcribeAudio({ dataUrl, mimeType: audioMimeType }, activeProfileName)
      const transcript = result.transcript.trim()

      if (!transcript) {
        voiceError = 'Transcription returned no text'
        return
      }

      const nextDraft = mergeTranscriptIntoDraft(composer.draft, transcript)
      setComposerDraft(sessionId, nextDraft)

      if (voiceConversationEnabled) {
        if (sessionId && !liveSid) {
          voiceError = 'Session is still resuming; transcript was added to the composer.'
          return
        }

        markComposerInterrupted(sessionId, false)
        await submitPrompt(sessionId, { text: nextDraft })
      } else {
        focusTextarea()
      }
    } catch (error) {
      voiceError = inlineVoiceError(error, 'Voice transcription failed')
    } finally {
      voiceTranscribing = false
    }
  }

  async function startVoiceRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      voiceError = 'Microphone capture is not available in this browser context'
      return
    }

    stopCurrentSpeechAudio()
    voiceError = null
    voicePlaybackStatus = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const options = recordingOptions()
      const recorder = new MediaRecorder(stream, options)

      mediaStream = stream
      mediaRecorder = recorder
      recordedAudioChunks = []
      discardVoiceRecording = false

      recorder.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
          recordedAudioChunks = [...recordedAudioChunks, event.data]
        }
      })

      recorder.addEventListener('stop', () => {
        const chunks = recordedAudioChunks
        const mimeType = recorder.mimeType || options?.mimeType || 'audio/webm'
        const shouldDiscard = discardVoiceRecording
        mediaRecorder = null
        recordedAudioChunks = []
        discardVoiceRecording = false
        voiceRecording = false
        stopVoiceStream()
        if (!shouldDiscard) {
          void transcribeVoiceChunks(chunks, mimeType)
        }
      })

      recorder.start()
      voiceRecording = true
    } catch (error) {
      stopVoiceStream()
      mediaRecorder = null
      recordedAudioChunks = []
      discardVoiceRecording = false
      voiceRecording = false
      voiceError = inlineVoiceError(error, 'Could not start microphone capture')
    }
  }

  function stopVoiceRecording(): void {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
  }

  async function handleVoiceButton(): Promise<void> {
    if (voiceRecording) {
      stopVoiceRecording()
      return
    }

    if (!canRecordVoice) return

    await startVoiceRecording()
  }

  function toggleVoiceConversation(): void {
    voiceConversationEnabled = !voiceConversationEnabled
    voiceError = null

    if (!voiceConversationEnabled) {
      stopCurrentSpeechAudio()
      voicePlaybackStatus = null
    }
  }

  async function playSpokenResponse(text: string): Promise<void> {
    if (!voiceConversationEnabled) return

    stopCurrentSpeechAudio()
    voicePlaybackStatus = 'requesting speech'

    try {
      const response = await speakText({ text, voiceId: selectedVoiceId }, activeProfileName)
      if (!response.data_url) {
        throw new Error('Speech synthesis returned no audio')
      }

      const audio = new Audio(response.data_url)
      currentSpeechAudio = audio
      voicePlaybackStatus = `speaking${response.provider ? ` via ${response.provider}` : ''}`
      audio.addEventListener('ended', () => {
        if (currentSpeechAudio === audio) {
          currentSpeechAudio = null
          voicePlaybackStatus = null
        }
      })
      audio.addEventListener('error', () => {
        if (currentSpeechAudio === audio) {
          currentSpeechAudio = null
          voicePlaybackStatus = null
          voiceError = 'Could not play synthesized speech'
        }
      })
      await audio.play()
    } catch (error) {
      currentSpeechAudio = null
      voicePlaybackStatus = null
      voiceError = inlineVoiceError(error, 'Speech playback failed')
    }
  }

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

<section class="p-3" data-selectable="true" aria-label="Composer">
  <div class="mx-auto max-w-5xl">
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

    <div class="mt-3">
      <Panel title={panelTitle} padded={false}>
        {#snippet leading()}
          {#if onToggleSidebar}
            <Button
              variant="unstyled"
              class="flex h-5 w-5 items-center justify-center p-0 text-ink-muted hover:text-ink-bright"
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
            rows="4"
            placeholder={connected ? 'type prompt :: Enter sends / Shift+Enter inserts newline' : 'link_down :: connect to Hermes gateway before typing'}
            disabled={!connected}
            oninput={handleDraftInput}
            onkeydown={handleKeydown}
          ></textarea>

          <div class="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2">
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

              <Button
                chrome="ghost"
                size="icon"
                variant={voiceRecording ? 'danger' : 'success'}
                onclick={() => void handleVoiceButton()}
                disabled={!canRecordVoice}
                aria-label="Record voice prompt"
                title={voiceRecording ? 'Stop voice recording' : 'Record voice prompt'}
              >
                {#if voiceRecording}
                  <span class="h-2.5 w-2.5 rounded-xs bg-current"></span>
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v10m0 0a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v2a4 4 0 0 0 4 4Zm0 0v4m-5 0h10" />
                  </svg>
                {/if}
              </Button>

              <Button
                chrome="ghost"
                variant={voiceConversationEnabled ? 'success' : 'default'}
                onclick={toggleVoiceConversation}
                disabled={!connected}
                title="Voice conversation: transcribe, submit, and speak replies"
              >
                Voice conversation
              </Button>

              {#if voiceChoicesAvailable}
                <label class="sr-only" for={`voice-select-${composerKey}`}>ElevenLabs voice</label>
                <select
                  id={`voice-select-${composerKey}`}
                  class={voiceSelectClass}
                  bind:value={selectedVoiceId}
                  disabled={!connected || voiceChoicesLoading}
                  title={`Server voices from ${VOICE_CHOICES_SOURCE}`}
                >
                  <option value="">default voice</option>
                  {#each voiceChoices as voice (voice.voice_id)}
                    <option value={voice.voice_id}>{voiceOptionLabel(voice)}</option>
                  {/each}
                </select>
              {/if}

              {#if voiceStatusMessage}
                <span class={voiceStatusClass} title={voiceStatusMessage}>{voiceStatusMessage}</span>
              {/if}

              {#if composer.attachments.length > 0}
                <Button
                  chrome="ghost"
                  onclick={() => clearComposerAttachments(sessionId)}
                >
                  Clear attachments
                </Button>
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
