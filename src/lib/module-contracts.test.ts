/// <reference types="vite/client" />

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

import * as hermesContract from '$lib/hermes'
import * as hermesComposerContract from '$lib/hermes/composer'
import * as hermesCronContract from '$lib/hermes/cron'
import * as hermesDashboardContract from '$lib/hermes/dashboard'
import * as hermesDashboardAdapterContract from '$lib/hermes/shared/adapters/dashboard-api-client'
import * as hermesFilesContract from '$lib/hermes/files'
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
import * as hermesKanbanContract from '$lib/hermes/kanban'
import * as hermesProfilesContract from '$lib/hermes/profiles'
import * as hermesPromptsContract from '$lib/hermes/prompts'
import * as hermesSessionsContract from '$lib/hermes/sessions'
import type {
  DashboardSessionPort as HermesDashboardSessionPort,
  SessionResumePort as HermesSessionResumePort
} from '$lib/hermes/sessions'
import * as hermesThreadsContract from '$lib/hermes/threads'
import * as layoutContract from '$lib/layout'
import * as monitoringContract from '$lib/monitoring'
import * as monitoringApplicationContract from '@/lib/monitoring/application/get-monitoring-metrics'
import * as monitoringAdapterContract from '$lib/monitoring/adapters/beszel-monitoring-adapter'
import * as monitoringFormatContract from '$lib/monitoring/domain/format'
import * as monitoringMetricsContract from '$lib/monitoring/domain/metrics'
import * as monitoringNormalizeContract from '$lib/monitoring/domain/normalize'
import type { MonitoringRequestJson } from '$lib/monitoring/ports/monitoring-port'
import * as notificationsContract from '$lib/notifications'
import * as platformContract from '$lib/platform'
import * as storageContract from '$lib/storage'
import * as typesContract from '$lib/types'
import * as uiContract from '$lib/ui'

const legacyCompatibilitySources = import.meta.glob(
  './{api,composer,files,gateway,messages,session,thread}/**/*.{ts,svelte}',
  { eager: true, import: 'default', query: '?raw' }
)
const legacyHermesStoreSources = import.meta.glob('./stores/**/*.{ts,svelte}', {
  eager: true,
  import: 'default',
  query: '?raw'
})

describe('module contract barrels', () => {
  it('removes obsolete transitional source paths after the Hermes lane migration', () => {
    expect(Object.keys(legacyCompatibilitySources)).toEqual([])
    expect(Object.keys(legacyHermesStoreSources)).toEqual([])
  })

  it('exposes Hermes dashboard, Cron, and Kanban plugin contracts through explicit Hermes entrypoints', () => {
    expect(hermesDashboardContract.dashboardRequest).toBeTypeOf('function')
    expect(hermesDashboardContract.getCronJobs).toBeTypeOf('function')
    expect(hermesDashboardContract.getKanbanBoard).toBeTypeOf('function')
    expect(hermesDashboardAdapterContract.dashboardRequest).toBe(hermesDashboardContract.dashboardRequest)
    expect(hermesCronContract.getCronJobs).toBe(hermesDashboardContract.getCronJobs)
    expect(hermesKanbanContract.getKanbanBoard).toBe(hermesDashboardContract.getKanbanBoard)
    expect(hermesContract.dashboardRequest).toBe(hermesDashboardContract.dashboardRequest)
    expect(hermesContract.getCronJobs).toBe(hermesDashboardContract.getCronJobs)
    expect(hermesContract.getKanbanBoard).toBe(hermesDashboardContract.getKanbanBoard)
  })

  it('exposes Hermes gateway runtime contracts through the Hermes gateway lane', () => {
    const gatewayRuntimePort: GatewayRuntimePort = {
      close: () => undefined,
      connect: async () => undefined,
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
    expect(hermesGatewayContract.HermesGateway).toBeTypeOf('function')
    expect(hermesGatewayContract.JsonRpcGatewayClient).toBeTypeOf('function')
    expect(hermesGatewayContract.createTauriGatewaySocket).toBeTypeOf('function')
    expect(hermesGatewayContract.gatewayState.connectionState).toBeTypeOf('string')
    expect(hermesContract.HermesGateway).toBe(hermesGatewayContract.HermesGateway)
  })

  it('exposes Hermes session lifecycle through the sessions feature entrypoint', () => {
    expect(hermesSessionsContract.resumeAndHydrateStoredSession).toBeTypeOf('function')
    expect(hermesSessionsContract.shouldShowSessionSidebarLoader).toBeTypeOf('function')
    expect(hermesSessionsContract.resumeSession).toBeTypeOf('function')
    expect(hermesSessionsContract.displaySessionIdFor).toBeTypeOf('function')
    expect(hermesSessionsContract.sessionState.activeSessionId).toBeNull()
    expect(hermesContract.resumeAndHydrateStoredSession).toBe(hermesSessionsContract.resumeAndHydrateStoredSession)
    expect(hermesContract.sessionMessagesLoaded).toBe(hermesSessionsContract.sessionMessagesLoaded)
    expect(hermesContract.shouldShowSessionSidebarLoader).toBe(hermesSessionsContract.shouldShowSessionSidebarLoader)
  })

  it('exposes Hermes thread ViewModel and message normalization through the threads feature entrypoint', () => {
    expect(hermesThreadsContract.extractCanvasReferences).toBeTypeOf('function')
    expect(hermesThreadsContract.previewFromRemoteFilePath).toBeTypeOf('function')
    expect(hermesThreadsContract.coerceGatewayText).toBeTypeOf('function')
    expect(hermesThreadsContract.attachmentFromMediaSource).toBeTypeOf('function')
    expect(hermesThreadsContract.messageState.sessions).toBeTypeOf('object')
    expect(hermesThreadsContract.threadForSession).toBeTypeOf('function')
    expect(hermesContract.coerceGatewayText).toBe(hermesThreadsContract.coerceGatewayText)
  })

  it('exposes Hermes composer, prompts, and profiles through lane entrypoints', () => {
    expect(hermesComposerContract.submitPrompt).toBeTypeOf('function')
    expect(hermesComposerContract.executeSlashCommand).toBeTypeOf('function')
    expect(hermesComposerContract.getQueuedPrompts).toBeTypeOf('function')
    expect(hermesComposerContract.parseSlashCommand).toBeTypeOf('function')
    expect(hermesComposerContract.shouldDispatchSlashImmediately).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToClarify).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToApproval).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToSudo).toBeTypeOf('function')
    expect(hermesPromptsContract.respondToSecret).toBeTypeOf('function')
    expect(hermesProfilesContract.normalizeProfileKey).toBeTypeOf('function')
    expect(hermesProfilesContract.ensureGatewayProfile).toBeTypeOf('function')
    expect(hermesProfilesContract.getProfileScope).toBeTypeOf('function')
  })

  it('exposes Hermes file contracts through the Hermes files lane', () => {
    const fileRef: HermesFileRef = { path: '/tmp/report.md', refText: '@file:/tmp/report.md' }
    const fileReference: HermesFileReference = { path: '/tmp/report.md', source: '/tmp/report.md' }
    const hrefMode: RemoteFileHrefMode = 'preview'
    const hrefSource: RemoteFileHrefSource = { mode: hrefMode, path: '/tmp/report.md' }
    const textResponse: RemoteFileTextResponse = { binary: false, path: '/tmp/report.md', text: 'report' }

    expect(fileRef.path).toBe('/tmp/report.md')
    expect(fileReference.source).toBe('/tmp/report.md')
    expect(hrefSource.mode).toBe('preview')
    expect(textResponse.text).toBe('report')
    expect(hermesFilesContract.parseHermesFileRef).toBeTypeOf('function')
    expect(hermesFilesContract.viewerKindForRemoteFile).toBeTypeOf('function')
    expect(hermesFilesContract.filePresentation).toBeTypeOf('function')
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
    expect(hermesContract.parseHermesFileRef).toBe(hermesFilesContract.parseHermesFileRef)
  })

  it('keeps monitoring and platform as separate public lanes', () => {
    const assertRequestPort = (requestJson: MonitoringRequestJson) => typeof requestJson === 'function'

    expect(monitoringContract.fetchMonitoringMetrics).toBe(monitoringApplicationContract.fetchMonitoringMetrics)
    expect(monitoringContract.monitoringConfig).toBe(monitoringAdapterContract.monitoringConfig)
    expect(monitoringContract.requestMonitoringJson).toBe(monitoringAdapterContract.requestMonitoringJson)
    expect(monitoringContract.formatBytes).toBe(monitoringFormatContract.formatBytes)
    expect(monitoringContract.sortMonitoringContainers).toBe(monitoringFormatContract.sortMonitoringContainers)
    expect(monitoringContract.EMPTY_MONITORING_METRICS).toBe(monitoringMetricsContract.EMPTY_MONITORING_METRICS)
    expect(monitoringContract.normalizeMonitoringMetrics).toBe(monitoringNormalizeContract.normalizeMonitoringMetrics)
    expect(assertRequestPort(async () => null)).toBe(true)
    expect(platformContract.invokeTauriCommand).toBeTypeOf('function')
    expect(platformContract.listenTauriEvent).toBeTypeOf('function')
    expect(platformContract.openExternalUrl).toBeTypeOf('function')
  })

  it('exposes non-Hermes utility barrels without collapsing their boundaries', () => {
    expect(layoutContract.clampPanelWidth).toBeTypeOf('function')
    expect(notificationsContract.buildAssistantCompleteNotification).toBeTypeOf('function')
    expect(storageContract.namespacedStorageKey).toBeTypeOf('function')
    expect(typesContract).toBeTypeOf('object')
    expect(uiContract.installCustomScrollbars).toBeTypeOf('function')
  })
})
