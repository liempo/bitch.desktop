import { describe, expect, it, vi } from 'vitest'

import {
  buildAssistantCompleteNotification,
  buildInputNeededNotification,
  sendMacosNotification,
  shouldSendMacosNotification
} from './macos'

describe('macOS desktop notifications', () => {
  it('builds a compact assistant completion notification body', () => {
    const notification = buildAssistantCompleteNotification({
      text: `\n\n  The courier returned with a lot of whitespace.\n\n${'chrome '.repeat(40)}`
    })

    expect(notification?.title).toBe('BITCH finished')
    expect(notification?.body).toMatch(/^The courier returned with a lot of whitespace\. chrome chrome/)
    expect(notification?.body.length).toBeLessThanOrEqual(160)
    expect(notification?.body.endsWith('…')).toBe(true)
  })

  it('builds a needs-input notification from prompt text', () => {
    expect(buildInputNeededNotification('Approval required for rm -rf no')).toEqual({
      title: 'BITCH needs input',
      body: 'Approval required for rm -rf no'
    })
  })

  it('only sends when running on macOS and the window is not focused', async () => {
    const backend = {
      isPermissionGranted: vi.fn().mockResolvedValue(false),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      sendNotification: vi.fn()
    }

    await sendMacosNotification(
      { title: 'BITCH finished', body: 'The run completed.' },
      { backend, isMacOs: true, isWindowFocused: () => false }
    )

    expect(backend.isPermissionGranted).toHaveBeenCalledOnce()
    expect(backend.requestPermission).toHaveBeenCalledOnce()
    expect(backend.sendNotification).toHaveBeenCalledWith({ title: 'BITCH finished', body: 'The run completed.' })
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
