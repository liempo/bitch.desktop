<script lang="ts">
  import { onDestroy } from 'svelte'
  import PreviewSidebar from './preview/PreviewSidebar.svelte'
  import Composer from './composer/Composer.svelte'
  import SecretModal from './prompts/SecretModal.svelte'
  import SudoModal from './prompts/SudoModal.svelte'
  import Sidebar from './sidebar/Sidebar.svelte'
  import Thread from './thread/Thread.svelte'
  import { routerState } from './router.svelte'
  import { gatewayState } from '$lib/stores/gateway.svelte'
  import { layoutState, toggleSidebar } from '$lib/stores/layout.svelte'
  import { getProfileScope, profileState } from '$lib/stores/profile.svelte'
  import { threadForSession } from '$lib/stores/messages.svelte'
  import { previewFromCanvas, type ThreadPreview } from '$lib/preview'
  import { resumeAndHydrateStoredSession } from '$lib/session/resume'
  import {
    clampPanelWidth,
    PREVIEW_PANEL_WIDTH,
    readPanelWidth,
    SESSION_SIDEBAR_WIDTH,
    writePanelWidth
  } from '$lib/layout/panel-resize'
  import { initializeSessions, loadSessions, sessionState, setActiveSession, startNewSession } from '$lib/stores/session.svelte'

  type ResizablePanel = 'sidebar' | 'preview'

  const RESIZE_STEP_PX = 24
  const MAX_RESUME_RETRIES = 4
  const RESUME_RETRY_BASE_MS = 1_000
  const RESUME_RETRY_MAX_MS = 8_000
  const PANEL_RESIZE_GAP_CLASS = 'hidden w-1 shrink-0 cursor-col-resize focus-visible:outline-2 focus-visible:outline-focus md:block'

  let resumeRetryTimer: ReturnType<typeof setTimeout> | null = null
  let resumeRetrySessionId: string | null = null
  let resumeRetryAttempt = 0

  let lastResumedSessionId: string | null = null
  let lastFreshSessionRequest = profileState.freshSessionRequest
  let lastLoadedScope: string | null = null
  let selectedPreview = $state<ThreadPreview | null>(null)
  let previewSessionId = $state<string | null>(null)
  let dismissedCanvasSource = $state<string | null>(null)
  let sidebarPanelWidth = $state(readPanelWidth(SESSION_SIDEBAR_WIDTH))
  let previewPanelWidth = $state(readPanelWidth(PREVIEW_PANEL_WIDTH))
  const connectionState = $derived(gatewayState.connectionState)
  const activeGatewayProfile = $derived(gatewayState.activeProfile)
  const sidebarOpen = $derived(layoutState.sidebarOpen)
  const selectedSessionId = $derived(routerState.route === 'session' ? routerState.sessionId : null)
  const selectedThread = $derived(threadForSession(selectedSessionId))
  const activeCanvas = $derived(selectedThread?.canvas ?? null)
  const canvasPreview = $derived(activeCanvas ? previewFromCanvas(activeCanvas) : null)
  const activePreview = $derived(
    selectedPreview ?? (canvasPreview && canvasPreview.source !== dismissedCanvasSource ? canvasPreview : null)
  )
  const selectedSession = $derived(selectedSessionId ? (sessionState.sessions.find(session => session.id === selectedSessionId) ?? null) : null)
  const selectedSessionProfile = $derived(
    selectedSessionId ? (selectedSession?.profile ?? sessionState.sessionProfilesById[selectedSessionId] ?? null) : null
  )
  const composerProfileName = $derived(selectedSessionProfile ?? profileState.newChatProfile ?? activeGatewayProfile)
  const chatTitle = $derived(selectedSession?.title?.trim() || (selectedSessionId ? 'Untitled session' : 'New session'))

  $effect(() => {
    if (connectionState === 'open') {
      void initializeSessions()
    }
  })

  $effect(() => {
    if (connectionState !== 'open') return

    const scope = getProfileScope()
    if (scope !== lastLoadedScope) {
      lastLoadedScope = scope
      void loadSessions(0)
    }
  })

  $effect(() => {
    const request = profileState.freshSessionRequest
    if (request !== lastFreshSessionRequest) {
      lastFreshSessionRequest = request
      lastResumedSessionId = null
      startNewSession()
    }
  })

  $effect(() => {
    const sessionId = selectedSessionId
    if (previewSessionId && previewSessionId !== sessionId) {
      selectedPreview = null
      previewSessionId = null
      dismissedCanvasSource = null
    }
  })

  function openPreview(preview: ThreadPreview): void {
    selectedPreview = preview
    previewSessionId = selectedSessionId
    if (preview.kind === 'canvas') {
      dismissedCanvasSource = null
    }
  }

  function closePreview(): void {
    if (selectedPreview) {
      selectedPreview = null
      previewSessionId = null
      return
    }

    if (canvasPreview) {
      dismissedCanvasSource = canvasPreview.source
    }
  }

  function configForPanel(panel: ResizablePanel) {
    return panel === 'sidebar' ? SESSION_SIDEBAR_WIDTH : PREVIEW_PANEL_WIDTH
  }

  function widthForPanel(panel: ResizablePanel): number {
    return panel === 'sidebar' ? sidebarPanelWidth : previewPanelWidth
  }

  function updatePanelWidth(panel: ResizablePanel, width: number): void {
    const config = configForPanel(panel)
    const nextWidth = clampPanelWidth(width, config)

    if (panel === 'sidebar') {
      sidebarPanelWidth = nextWidth
    } else {
      previewPanelWidth = nextWidth
    }

    writePanelWidth(nextWidth, config)
  }

  function resumeRetryDelayMs(attempt: number): number {
    return Math.min(RESUME_RETRY_MAX_MS, RESUME_RETRY_BASE_MS * 2 ** attempt)
  }

  function clearResumeRetryTimer(): void {
    if (resumeRetryTimer) {
      clearTimeout(resumeRetryTimer)
      resumeRetryTimer = null
    }
  }

  onDestroy(() => {
    clearResumeRetryTimer()
  })

  function startPanelResize(panel: ResizablePanel, event: PointerEvent): void {
    if (event.button !== 0) return

    const startX = event.clientX
    const startWidth = widthForPanel(panel)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    event.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function handlePointerMove(moveEvent: PointerEvent): void {
      const delta = panel === 'sidebar' ? moveEvent.clientX - startX : startX - moveEvent.clientX
      updatePanelWidth(panel, startWidth + delta)
    }

    function stopResize(): void {
      window.removeEventListener('pointermove', handlePointerMove)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize, { once: true })
    window.addEventListener('pointercancel', stopResize, { once: true })
  }

  function handlePanelResizeKeydown(panel: ResizablePanel, event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    const dividerDelta = event.key === 'ArrowRight' ? RESIZE_STEP_PX : -RESIZE_STEP_PX
    const widthDelta = panel === 'sidebar' ? dividerDelta : -dividerDelta

    updatePanelWidth(panel, widthForPanel(panel) + widthDelta)
  }

  async function resumeAndHydrate(sessionId: string): Promise<boolean> {
    // Route/session selection is keyed by the persistent stored id. The shared
    // helper mirrors upstream Desktop: fetch the stored snapshot first, resume
    // the live runtime second, and ignore stale completions when the route has
    // already moved on.
    return resumeAndHydrateStoredSession(sessionId)
  }

  $effect(() => {
    if (connectionState !== 'open') return

    if (routerState.route === 'new') {
      lastResumedSessionId = null
      setActiveSession(null)
      return
    }

    if (routerState.sessionId && routerState.sessionId !== lastResumedSessionId) {
      const requestedSessionId = routerState.sessionId
      lastResumedSessionId = requestedSessionId
      void resumeAndHydrate(requestedSessionId).then(applied => {
        if (!applied && routerState.sessionId === requestedSessionId) {
          lastResumedSessionId = null
        }
      })
    }
  })

  $effect(() => {
    const sessionId = selectedSessionId
    const stranded =
      connectionState === 'open' &&
      Boolean(sessionId) &&
      sessionState.resumeFailedSessionId === sessionId &&
      sessionState.resumeExhaustedSessionId !== sessionId

    if (!stranded || !sessionId) {
      clearResumeRetryTimer()
      if (resumeRetrySessionId !== sessionId) {
        resumeRetrySessionId = null
        resumeRetryAttempt = 0
      }
      return
    }

    if (resumeRetrySessionId !== sessionId) {
      clearResumeRetryTimer()
      resumeRetrySessionId = sessionId
      resumeRetryAttempt = 0
    }

    if (resumeRetryAttempt >= MAX_RESUME_RETRIES) {
      sessionState.resumeExhaustedSessionId = sessionId
      clearResumeRetryTimer()
      return
    }

    if (resumeRetryTimer) return

    const attempt = resumeRetryAttempt
    resumeRetryTimer = setTimeout(() => {
      resumeRetryTimer = null

      if (
        connectionState !== 'open' ||
        selectedSessionId !== sessionId ||
        sessionState.resumeFailedSessionId !== sessionId ||
        sessionState.activeSessionId
      ) {
        return
      }

      resumeRetryAttempt += 1
      lastResumedSessionId = null
      void resumeAndHydrate(sessionId).then(applied => {
        if (applied) {
          resumeRetrySessionId = null
          resumeRetryAttempt = 0
        }
      })
    }, resumeRetryDelayMs(attempt))
  })
</script>

<div class="flex h-full min-h-0 flex-col py-4">
  <div class="flex min-h-0 w-full flex-1 flex-col gap-0 p-0 md:flex-row">
    <!-- ===== Sidebar ===== -->
    {#if sidebarOpen}
      <Sidebar width={sidebarPanelWidth} />
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class={PANEL_RESIZE_GAP_CLASS}
        role="separator"
        tabindex="0"
        aria-label="Resize session sidebar"
        aria-orientation="vertical"
        aria-valuemin={SESSION_SIDEBAR_WIDTH.minWidth}
        aria-valuemax={SESSION_SIDEBAR_WIDTH.maxWidth}
        aria-valuenow={sidebarPanelWidth}
        onpointerdown={event => startPanelResize('sidebar', event)}
        onkeydown={event => handlePanelResizeKeydown('sidebar', event)}
      ></div>
    {/if}

    <!-- ===== Main terminal ===== -->
    <main class="relative flex min-w-0 flex-1 flex-col overflow-hidden border-0 bg-transparent" aria-label="BITCH terminal workspace">
      {#if profileState.gatewaySwapTarget}
        <div class="pointer-events-none absolute inset-x-4 top-4 z-20 border border-primary/35 bg-canvas px-4 py-2 text-xs uppercase tracking-[0.14em] text-primary">
          HANDSHAKE::{profileState.gatewaySwapTarget} PROFILE
        </div>
      {/if}

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Thread sessionId={selectedSessionId} onOpenPreview={openPreview} />
      </div>

      <Composer
        sessionId={selectedSessionId}
        connected={connectionState === 'open'}
        sessionTitle={chatTitle}
        profileName={composerProfileName}
        {sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
    </main>

    {#if activePreview}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class={PANEL_RESIZE_GAP_CLASS}
        role="separator"
        tabindex="0"
        aria-label="Resize preview sidebar"
        aria-orientation="vertical"
        aria-valuemin={PREVIEW_PANEL_WIDTH.minWidth}
        aria-valuemax={PREVIEW_PANEL_WIDTH.maxWidth}
        aria-valuenow={previewPanelWidth}
        onpointerdown={event => startPanelResize('preview', event)}
        onkeydown={event => handlePanelResizeKeydown('preview', event)}
      ></div>
      <PreviewSidebar preview={activePreview} width={previewPanelWidth} profile={composerProfileName} onClose={closePreview} />
    {/if}
  </div>

  <SudoModal />
  <SecretModal />
</div>
