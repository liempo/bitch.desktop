import { describe, expect, it, vi } from 'vitest'

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen
}))

import '$lib/files/local'

import * as apiContract from '$lib/api'
import * as filesContract from '$lib/files'
import * as gatewayContract from '$lib/gateway'
import * as legacyGatewayConnectionConfig from '$lib/gateway/connection-config'
import * as legacyGatewayHermes from '$lib/gateway/hermes'
import * as legacyGatewayJsonRpc from '$lib/gateway/json-rpc-gateway'
import * as legacyGatewaySocket from '$lib/gateway/tauri-gateway-socket'
import * as legacyMessageNormalization from '$lib/messages/chat-runtime'
import * as legacyMediaAttachments from '$lib/messages/media-attachments'
import * as legacySessionResume from '$lib/session/resume'
import * as legacySessionSidebar from '$lib/session/sidebar-loader'
import * as legacyThreadCanvas from '$lib/thread/canvas'
import * as legacyThreadPreview from '$lib/thread/preview'
import * as hermesContract from '$lib/hermes'
import * as hermesDashboardContract from '$lib/hermes/dashboard'
import * as hermesDashboardAdapterContract from '$lib/hermes/shared/adapters/dashboard-api-client'
import * as hermesCronContract from '$lib/hermes/cron'
import * as hermesFilesContract from '$lib/hermes/files'
import * as hermesKanbanContract from '$lib/hermes/kanban'
import type {
  HermesFileRef,
  HermesFileReference,
  RemoteFileHrefMode,
  RemoteFileHrefSource,
  RemoteFileTextResponse
} from '$lib/hermes/files'
import * as hermesGatewayContract from '$lib/hermes/gateway'
import type {
  DashboardSessionPort,
  GatewayRuntimePort,
  PromptSubmissionPort,
  SessionResumePort
} from '$lib/hermes/gateway'
import * as hermesComposerContract from '$lib/hermes/composer'
import * as hermesProfilesContract from '$lib/hermes/profiles'
import * as hermesPromptsContract from '$lib/hermes/prompts'
import * as hermesSessionsContract from '$lib/hermes/sessions'
import type {
  DashboardSessionPort as HermesDashboardSessionPort,
  SessionResumePort as HermesSessionResumePort
} from '$lib/hermes/sessions'
import * as hermesThreadsContract from '$lib/hermes/threads'
import * as monitoringContract from '$lib/monitoring'
import * as monitoringApplicationContract from '$lib/monitoring/application/get-host-metrics'
import * as monitoringAdapterContract from '$lib/monitoring/adapters/beszel-monitoring-adapter'
import * as monitoringFormatContract from '$lib/monitoring/domain/format'
import * as monitoringMetricsContract from '$lib/monitoring/domain/metrics'
import * as monitoringNormalizeContract from '$lib/monitoring/domain/normalize'
import type { HostMonitorRequestJson } from '$lib/monitoring/ports/monitoring-port'
import * as platformContract from '$lib/platform'
import * as composerContract from '$lib/composer'
import * as composerQueueStoreContract from '$lib/stores/composer-queue'
import * as composerStoreContract from '$lib/stores/composer.svelte'
import * as layoutContract from '$lib/layout'
import * as messagesContract from '$lib/messages'
import * as notificationsContract from '$lib/notifications'
import * as profileStoreContract from '$lib/stores/profile.svelte'
import * as promptsStoreContract from '$lib/stores/prompts.svelte'
import * as sessionContract from '$lib/session'
import * as storageContract from '$lib/storage'
import * as threadContract from '$lib/thread'
import * as typesContract from '$lib/types'
import * as uiContract from '$lib/ui'

describe('module contract barrels', () => {
  it('exposes Hermes dashboard, Cron, and Kanban plugin contracts through explicit Hermes entrypoints', () => {
    expect(apiContract.dashboardRequest).toBeTypeOf('function')
    expect(apiContract.getCronJobs).toBeTypeOf('function')
    expect(apiContract.getKanbanBoard).toBeTypeOf('function')
    expect(hermesDashboardAdapterContract.dashboardRequest).toBe(apiContract.dashboardRequest)
    expect(hermesDashboardContract.dashboardRequest).toBe(apiContract.dashboardRequest)
    expect(hermesDashboardContract.getCronJobs).toBe(apiContract.getCronJobs)
    expect(hermesDashboardContract.getKanbanBoard).toBe(apiContract.getKanbanBoard)
    expect(hermesCronContract.getCronJobs).toBe(apiContract.getCronJobs)
    expect(hermesKanbanContract.getKanbanBoard).toBe(apiContract.getKanbanBoard)
    expect(hermesContract.dashboardRequest).toBe(apiContract.dashboardRequest)
    expect(hermesContract.getCronJobs).toBe(apiContract.getCronJobs)
    expect(hermesContract.getKanbanBoard).toBe(apiContract.getKanbanBoard)
  })

  it('exposes existing Hermes gateway contracts through old and transitional entrypoints', () => {
    const gatewayRuntimePort: GatewayRuntimePort = {
      connect: async () => undefined,
      close: () => undefined,
      on: () => () => undefined,
      onEvent: () => () => undefined,
      onState: () => () => undefined,
      request: async <T>() => ({ ok: true }) as T
    }
    const dashboardSessionPort: DashboardSessionPort = {
      listSessions: async () => ({ limit: 0, offset: 0, sessions: [], total: 0 }),
      searchSessions: async () => ({ results: [] })
    }
    const sessionResumePort: SessionResumePort = {
      resumeSession: async () => null
    }
    const promptSubmissionPort: PromptSubmissionPort = {
      submitPrompt: async () => ({ session_id: 'runtime-id' })
    }

    const hermesDashboardSessionPort: HermesDashboardSessionPort = dashboardSessionPort
    const hermesSessionResumePort: HermesSessionResumePort = sessionResumePort

    expect(gatewayRuntimePort.close).toBeTypeOf('function')
    expect(dashboardSessionPort.listSessions).toBeTypeOf('function')
    expect(hermesDashboardSessionPort.searchSessions).toBeTypeOf('function')
    expect(sessionResumePort.resumeSession).toBeTypeOf('function')
    expect(hermesSessionResumePort.resumeSession).toBeTypeOf('function')
    expect(promptSubmissionPort.submitPrompt).toBeTypeOf('function')
    expect(gatewayContract.HermesGateway).toBeTypeOf('function')
    expect(gatewayContract.JsonRpcGatewayClient).toBeTypeOf('function')
    expect(gatewayContract.createTauriGatewaySocket).toBeTypeOf('function')
    expect(legacyGatewayConnectionConfig.normalizeRemoteBaseUrl).toBe(gatewayContract.normalizeRemoteBaseUrl)
    expect(legacyGatewayHermes.HermesGateway).toBe(gatewayContract.HermesGateway)
    expect(legacyGatewayJsonRpc.JsonRpcGatewayClient).toBe(gatewayContract.JsonRpcGatewayClient)
    expect(legacyGatewaySocket.createTauriGatewaySocket).toBe(gatewayContract.createTauriGatewaySocket)
    expect(hermesGatewayContract.HermesGateway).toBe(gatewayContract.HermesGateway)
    expect(hermesContract.HermesGateway).toBe(gatewayContract.HermesGateway)
  })

  it('exposes Hermes session lifecycle through the sessions feature entrypoint', () => {
    expect(hermesSessionsContract.resumeAndHydrateStoredSession).toBeTypeOf('function')
    expect(hermesSessionsContract.shouldShowSessionSidebarLoader).toBeTypeOf('function')
    expect(hermesSessionsContract.resumeSession).toBeTypeOf('function')
    expect(hermesSessionsContract.displaySessionIdFor).toBeTypeOf('function')
    expect(sessionContract.resumeAndHydrateStoredSession).toBe(hermesSessionsContract.resumeAndHydrateStoredSession)
    expect(legacySessionResume.resumeAndHydrateStoredSession).toBe(hermesSessionsContract.resumeAndHydrateStoredSession)
    expect(legacySessionSidebar.shouldShowSessionSidebarLoader).toBe(
      hermesSessionsContract.shouldShowSessionSidebarLoader
    )
    expect(hermesContract.resumeAndHydrateStoredSession).toBe(hermesSessionsContract.resumeAndHydrateStoredSession)
    expect(hermesContract.sessionMessagesLoaded).toBe(hermesSessionsContract.sessionMessagesLoaded)
    expect(hermesContract.shouldShowSessionSidebarLoader).toBe(hermesSessionsContract.shouldShowSessionSidebarLoader)
  })

  it('exposes Hermes thread and message normalization through the threads feature entrypoint', () => {
    expect(hermesThreadsContract.extractCanvasReferences).toBeTypeOf('function')
    expect(hermesThreadsContract.previewFromRemoteFilePath).toBeTypeOf('function')
    expect(hermesThreadsContract.coerceGatewayText).toBeTypeOf('function')
    expect(hermesThreadsContract.attachmentFromMediaSource).toBeTypeOf('function')
    expect(messagesContract.coerceGatewayText).toBe(hermesThreadsContract.coerceGatewayText)
    expect(legacyMessageNormalization.coerceGatewayText).toBe(hermesThreadsContract.coerceGatewayText)
    expect(legacyMediaAttachments.attachmentFromMediaSource).toBe(hermesThreadsContract.attachmentFromMediaSource)
    expect(threadContract.previewFromRemoteFilePath).toBe(hermesThreadsContract.previewFromRemoteFilePath)
    expect(legacyThreadCanvas.extractCanvasReferences).toBe(hermesThreadsContract.extractCanvasReferences)
    expect(legacyThreadPreview.previewFromRemoteFilePath).toBe(hermesThreadsContract.previewFromRemoteFilePath)
    expect(hermesContract.coerceGatewayText).toBe(hermesThreadsContract.coerceGatewayText)
  })

  it('exposes Hermes composer orchestration through new and legacy entrypoints', () => {
    expect(hermesComposerContract.submitPrompt).toBeTypeOf('function')
    expect(hermesComposerContract.executeSlashCommand).toBeTypeOf('function')
    expect(hermesComposerContract.getQueuedPrompts).toBeTypeOf('function')
    expect(hermesComposerContract.parseSlashCommand).toBeTypeOf('function')
    expect(hermesComposerContract.shouldDispatchSlashImmediately).toBeTypeOf('function')
    expect(composerContract.parseSlashCommand).toBe(hermesComposerContract.parseSlashCommand)
    expect(composerContract.shouldDispatchSlashImmediately).toBe(hermesComposerContract.shouldDispatchSlashImmediately)
    expect(composerStoreContract.submitPrompt).toBe(hermesComposerContract.submitPrompt)
    expect(composerStoreContract.executeSlashCommand).toBe(hermesComposerContract.executeSlashCommand)
    expect(composerQueueStoreContract.getQueuedPrompts).toBe(hermesComposerContract.getQueuedPrompts)
  })

  it('exposes Hermes prompt response orchestration through new and legacy entrypoints', () => {
    expect(hermesPromptsContract.respondToClarify).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToApproval).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToSudo).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToSecret).toBeTypeOf('function')
    expect(promptsStoreContract.respondToClarify).toBe(hermesPromptsContract.respondToClarify)
    expect(promptsStoreContract.respondToApproval).toBe(hermesPromptsContract.respondToApproval)
  })

  it('exposes Hermes profile state helpers through new and legacy entrypoints', () => {
    expect(hermesProfilesContract.normalizeProfileKey).toBeTypeOf('function')
    expect(hermesProfilesContract.ensureGatewayProfile).toBeTypeOf('function')
    expect(hermesProfilesContract.getProfileScope).toBeTypeOf('function')
    expect(profileStoreContract.normalizeProfileKey).toBe(hermesProfilesContract.normalizeProfileKey)
    expect(profileStoreContract.ensureGatewayProfile).toBe(hermesProfilesContract.ensureGatewayProfile)
  })

  it('exposes existing Hermes file contracts through old and transitional entrypoints', () => {
    const fileRef: HermesFileRef = { path: '/tmp/report.md', refText: '@file:/tmp/report.md' }
    const fileReference: HermesFileReference = { path: '/tmp/report.md', source: '/tmp/report.md' }
    const hrefMode: RemoteFileHrefMode = 'preview'
    const hrefSource: RemoteFileHrefSource = { mode: hrefMode, path: '/tmp/report.md' }
    const textResponse: RemoteFileTextResponse = { binary: false, path: '/tmp/report.md', text: 'report' }

    expect(fileRef.path).toBe('/tmp/report.md')
    expect(fileReference.source).toBe('/tmp/report.md')
    expect(hrefSource.mode).toBe('preview')
    expect(textResponse.text).toBe('report')

    expect(filesContract.parseHermesFileRef).toBeTypeOf('function')
    expect(filesContract.viewerKindForRemoteFile).toBeTypeOf('function')
    expect(filesContract.filePresentation).toBeTypeOf('function')
    expect(hermesFilesContract.filePathFromRemoteSource).toBeTypeOf('function')
    expect(hermesFilesContract.filePathFromMediaPath).toBeTypeOf('function')
    expect(hermesFilesContract.fetchRemoteFileListing).toBeTypeOf('function')
    expect(hermesFilesContract.getRemoteDefaultCwd).toBeTypeOf('function')
    expect(hermesFilesContract.isAbsoluteRemoteFilePath).toBeTypeOf('function')
    expect(hermesFilesContract.isDeniedRemoteFilePath).toBeTypeOf('function')
    expect(hermesFilesContract.isRemoteGatewayMediaPath).toBeTypeOf('function')
    expect(hermesFilesContract.isTextPreviewFile).toBeTypeOf('function')
    expect(hermesFilesContract.listRemoteDirectory).toBeTypeOf('function')
    expect(hermesFilesContract.mediaExtension).toBeTypeOf('function')
    expect(hermesFilesContract.mediaName).toBeTypeOf('function')
    expect(hermesFilesContract.normalizeRemoteFileListing).toBeTypeOf('function')
    expect(hermesFilesContract.parseHermesFileReference).toBeTypeOf('function')
    expect(hermesFilesContract.readRemoteFileDataUrl).toBeTypeOf('function')
    expect(hermesFilesContract.readRemoteFileText).toBeTypeOf('function')
    expect(hermesFilesContract.remoteFileExtension).toBeTypeOf('function')
    expect(hermesFilesContract.remoteFileHref).toBeTypeOf('function')
    expect(hermesFilesContract.remoteFileLabel).toBeTypeOf('function')
    expect(hermesFilesContract.remoteFileMediaKind).toBeTypeOf('function')
    expect(hermesFilesContract.remoteFilePreviewHref).toBeTypeOf('function')
    expect(hermesFilesContract.remoteFileSourceFromHref).toBeTypeOf('function')
    expect(hermesFilesContract.renderPreviewMediaReferences).toBeTypeOf('function')
    expect(hermesFilesContract.resolveRemoteFileDataUrl).toBeTypeOf('function')
    expect(hermesFilesContract.resolveRemoteFileText).toBeTypeOf('function')
    expect(hermesFilesContract.sourceFromRemoteFilePreviewHref).toBeTypeOf('function')
    expect(hermesFilesContract.parseHermesFileRef).toBe(filesContract.parseHermesFileRef)
    expect(hermesContract.parseHermesFileRef).toBe(filesContract.parseHermesFileRef)
  })

  it('keeps monitoring and platform as separate public lanes', () => {
    const assertRequestPort = (requestJson: HostMonitorRequestJson) => typeof requestJson === 'function'

    expect(monitoringContract.fetchHostMetrics).toBe(monitoringApplicationContract.fetchHostMetrics)
    expect(monitoringContract.hostMonitorConfig).toBe(monitoringAdapterContract.hostMonitorConfig)
    expect(monitoringContract.requestHostMonitorJson).toBe(monitoringAdapterContract.requestHostMonitorJson)
    expect(monitoringContract.formatBytes).toBe(monitoringFormatContract.formatBytes)
    expect(monitoringContract.sortHostProcesses).toBe(monitoringFormatContract.sortHostProcesses)
    expect(monitoringContract.EMPTY_HOST_METRICS).toBe(monitoringMetricsContract.EMPTY_HOST_METRICS)
    expect(monitoringContract.normalizeHostMetrics).toBe(monitoringNormalizeContract.normalizeHostMetrics)
    expect(assertRequestPort(async () => null)).toBe(true)
    expect(platformContract.invokeTauriCommand).toBeTypeOf('function')
    expect(platformContract.listenTauriEvent).toBeTypeOf('function')
    expect(platformContract.openExternalUrl).toBeTypeOf('function')
  })

  it('exposes non-Hermes utility barrels without collapsing their boundaries', () => {
    expect(composerContract.parseSlashCommand).toBeTypeOf('function')
    expect(layoutContract.clampPanelWidth).toBeTypeOf('function')
    expect(messagesContract.coerceGatewayText).toBeTypeOf('function')
    expect(notificationsContract.buildAssistantCompleteNotification).toBeTypeOf('function')
    expect(sessionContract.shouldShowSessionSidebarLoader).toBeTypeOf('function')
    expect(storageContract.namespacedStorageKey).toBeTypeOf('function')
    expect(threadContract.previewFromRemoteFilePath).toBeTypeOf('function')
    expect(typesContract).toBeTypeOf('object')
    expect(uiContract.installCustomScrollbars).toBeTypeOf('function')
  })
})
