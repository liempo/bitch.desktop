import { describe, expect, it, vi } from 'vitest'

import {
  buildAssistantCompleteNotification,
  buildCronFailedNotification,
  buildInputNeededNotification,
  buildKanbanUpdateNotification,
  installMacosNotificationClickHandler,
  loadNotificationPreferences,
  routeTargetFromNotificationAction,
  sendMacosNotification,
  sessionIdFromNotificationAction,
  setNotificationPreference,
  shouldSendMacosNotification
} from '../../platform/notifications'
import { namespacedStorageKey } from '../../storage/namespace'

function storageStub(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() {
      return values.size
    },
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    })
  }
}

const notificationPreferencesKey = namespacedStorageKey('notificationPreferences.v1')

describe('macOS desktop notifications', () => {
  it('loads and persists per-category notification preferences in the app namespace', () => {
    const storage = storageStub()

    expect(loadNotificationPreferences(storage)).toMatchObject({
      approvalNeeded: true,
      clarifyNeeded: true,
      cronFailed: true,
      kanbanUpdate: true,
      runCompleted: true,
      runFailed: true
    })

    const updated = setNotificationPreference('cronFailed', false, storage)

    expect(updated.cronFailed).toBe(false)
    expect(JSON.parse(storage.getItem(notificationPreferencesKey) ?? '{}')).toMatchObject({ cronFailed: false })
  })

  it('skips disabled notification categories before requesting permission', async () => {
    const storage = storageStub()
    setNotificationPreference('runCompleted', false, storage)
    const backend = {
      isPermissionGranted: vi.fn(),
      requestPermission: vi.fn(),
      sendNotification: vi.fn()
    }

    await sendMacosNotification(
      { body: 'The run completed.', category: 'runCompleted', title: 'BITCH finished' },
      { backend, isMacOs: true, isWindowFocused: () => false, storage }
    )

    expect(backend.isPermissionGranted).not.toHaveBeenCalled()
    expect(backend.sendNotification).not.toHaveBeenCalled()
  })

  it('builds a compact assistant completion notification body', () => {
    const notification = buildAssistantCompleteNotification({
      text: `

  The courier returned with a lot of whitespace.

${'chrome '.repeat(40)}`
    })

    expect(notification?.title).toBe('BITCH finished')
    expect(notification?.category).toBe('runCompleted')
    expect(notification?.body).toMatch(/^The courier returned with a lot of whitespace\. chrome chrome/)
    expect(notification?.body.length).toBeLessThanOrEqual(160)
    expect(notification?.body.endsWith('…')).toBe(true)
  })

  it('builds a needs-input notification from prompt text with the target session id', () => {
    expect(buildInputNeededNotification('Approval required for rm -rf no', 'stored-session')).toEqual({
      title: 'BITCH needs input',
      body: 'Approval required for rm -rf no',
      category: 'approvalNeeded',
      route: { page: 'agent', sessionId: 'stored-session' },
      sessionId: 'stored-session'
    })
  })

  it('builds route-aware cron failure and Kanban update notifications', () => {
    expect(
      buildCronFailedNotification({
        error: 'exit 1',
        jobId: 'nightly-backup',
        jobName: 'Nightly backup',
        profile: 'default'
      })
    ).toMatchObject({
      body: 'Nightly backup: exit 1',
      category: 'cronFailed',
      route: { jobId: 'nightly-backup', page: 'cron', profile: 'default' },
      title: 'BITCH cron failed'
    })

    expect(
      buildKanbanUpdateNotification({
        board: 'homelab',
        status: 'blocked',
        taskId: 't_bitch_notifications_settings',
        taskTitle: 'Notification settings',
        tenant: 'bitch'
      })
    ).toMatchObject({
      body: 'Notification settings moved to blocked',
      category: 'kanbanUpdate',
      route: { board: 'homelab', page: 'kanban', taskId: 't_bitch_notifications_settings', tenant: 'bitch' },
      title: 'BITCH Kanban update'
    })
  })

  it('only sends when running on macOS and the window is not focused', async () => {
    const backend = {
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      sendNotification: vi.fn()
    }

    await sendMacosNotification(
      { title: 'BITCH finished', body: 'The run completed.', sessionId: 'stored-session' },
      { backend, isMacOs: true, isWindowFocused: () => false }
    )

    expect(backend.isPermissionGranted).toHaveBeenCalledOnce()
    expect(backend.requestPermission).toHaveBeenCalledOnce()
    expect(backend.sendNotification).toHaveBeenCalledWith({
      title: 'BITCH finished',
      body: 'The run completed.',
      autoCancel: true,
      extra: {
        bitchNotificationCategory: 'runCompleted',
        bitchNotificationRoute: { page: 'agent', sessionId: 'stored-session' },
        bitchSessionId: 'stored-session'
      },
      group: 'session:stored-session'
    })
  })

  it('extracts and routes notification clicks to stored session ids', async () => {
    const unregister = vi.fn()
    const onSessionClick = vi.fn()
    const backend = {
      onAction: vi.fn(async (handler: (payload: { extra?: Record<string, unknown> }) => void) => {
        handler({ extra: { bitchSessionId: 'stored-session' } })
        handler({ extra: { unrelated: 'ignored' } })
        return { unregister }
      })
    }

    const unlisten = await installMacosNotificationClickHandler(onSessionClick, {
      backend,
      isMacOs: true,
      isTauriRuntime: true
    })
    await unlisten()

    expect(sessionIdFromNotificationAction({ extra: { bitchSessionId: 'stored-session' } })).toBe('stored-session')
    expect(sessionIdFromNotificationAction({ extra: { bitchSessionId: '   ' } })).toBeNull()
    expect(routeTargetFromNotificationAction({ extra: { bitchSessionId: 'stored-session' } })).toEqual({
      page: 'agent',
      sessionId: 'stored-session'
    })
    expect(
      routeTargetFromNotificationAction({
        extra: { bitchNotificationRoute: { board: 'homelab', page: 'kanban', taskId: 't_1' } }
      })
    ).toEqual({ board: 'homelab', page: 'kanban', taskId: 't_1' })
    expect(onSessionClick).toHaveBeenCalledOnce()
    expect(onSessionClick).toHaveBeenCalledWith({ page: 'agent', sessionId: 'stored-session' })
    expect(unregister).toHaveBeenCalledOnce()
  })

  it('does not install click listeners outside macOS Tauri runtime', async () => {
    const backend = { onAction: vi.fn() }

    const unlisten = await installMacosNotificationClickHandler(vi.fn(), {
      backend,
      isMacOs: true,
      isTauriRuntime: false
    })

    unlisten()
    expect(backend.onAction).not.toHaveBeenCalled()
  })

  it('does not request permission or send while focused or off macOS', async () => {
    const focusedBackend = {
      isPermissionGranted: vi.fn(),
      requestPermission: vi.fn(),
      sendNotification: vi.fn()
    }
    const linuxBackend = {
      isPermissionGranted: vi.fn(),
      requestPermission: vi.fn(),
      sendNotification: vi.fn()
    }

    expect(shouldSendMacosNotification({ isMacOs: true, isWindowFocused: true })).toBe(false)
    expect(shouldSendMacosNotification({ isMacOs: false, isWindowFocused: false })).toBe(false)

    await sendMacosNotification(
      { title: 'BITCH finished', body: 'The run completed.' },
      { backend: focusedBackend, isMacOs: true, isWindowFocused: () => true }
    )
    await sendMacosNotification(
      { title: 'BITCH finished', body: 'The run completed.' },
      { backend: linuxBackend, isMacOs: false, isWindowFocused: () => false }
    )

    expect(focusedBackend.isPermissionGranted).not.toHaveBeenCalled()
    expect(focusedBackend.sendNotification).not.toHaveBeenCalled()
    expect(linuxBackend.isPermissionGranted).not.toHaveBeenCalled()
    expect(linuxBackend.sendNotification).not.toHaveBeenCalled()
  })
})
