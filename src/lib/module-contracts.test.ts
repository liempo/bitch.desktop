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
import * as hermesContract from '$lib/hermes'
import * as hermesDashboardContract from '$lib/hermes/dashboard'
import * as hermesFilesContract from '$lib/hermes/files'
import type {
  HermesFileRef,
  HermesFileReference,
  RemoteFileHrefMode,
  RemoteFileHrefSource,
  RemoteFileTextResponse
} from '$lib/hermes/files'
import * as hermesGatewayContract from '$lib/hermes/gateway'
import * as monitoringContract from '$lib/monitoring'
import * as platformContract from '$lib/platform'
import * as composerContract from '$lib/composer'
import * as layoutContract from '$lib/layout'
import * as messagesContract from '$lib/messages'
import * as notificationsContract from '$lib/notifications'
import * as sessionContract from '$lib/session'
import * as storageContract from '$lib/storage'
import * as threadContract from '$lib/thread'
import * as typesContract from '$lib/types'
import * as uiContract from '$lib/ui'

describe('module contract barrels', () => {
  it('exposes existing Hermes dashboard contracts through old and transitional entrypoints', () => {
    expect(apiContract.dashboardRequest).toBeTypeOf('function')
    expect(apiContract.getCronJobs).toBeTypeOf('function')
    expect(apiContract.getKanbanBoard).toBeTypeOf('function')
    expect(hermesDashboardContract.dashboardRequest).toBe(apiContract.dashboardRequest)
    expect(hermesContract.dashboardRequest).toBe(apiContract.dashboardRequest)
  })

  it('exposes existing Hermes gateway contracts through old and transitional entrypoints', () => {
    expect(gatewayContract.HermesGateway).toBeTypeOf('function')
    expect(gatewayContract.JsonRpcGatewayClient).toBeTypeOf('function')
    expect(gatewayContract.createTauriGatewaySocket).toBeTypeOf('function')
    expect(hermesGatewayContract.HermesGateway).toBe(gatewayContract.HermesGateway)
    expect(hermesContract.HermesGateway).toBe(gatewayContract.HermesGateway)
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
    expect(monitoringContract.fetchHostMetrics).toBeTypeOf('function')
    expect(monitoringContract.hostMonitorConfig).toBeTypeOf('function')
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
