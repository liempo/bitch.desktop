import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

import {
  createSkill,
  getConfigRaw,
  getConfigSchema,
  getMessagingPlatforms,
  getSkills,
  getToolsets,
  saveConfigRaw,
  setModelAssignment,
  testMessagingPlatform,
  toggleSkill,
  toggleToolset,
  uninstallSkillFromHub,
  updateMessagingPlatform,
  updateSkillContent
} from '$lib/api/dashboard'

describe('admin dashboard API wrappers', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('routes profile-scoped admin reads through the Tauri dashboard bridge', async () => {
    mockInvoke.mockResolvedValueOnce({ yaml: 'model: {}', path: '/box/.hermes/config.yaml' })
    await expect(getConfigRaw('crypto/profile')).resolves.toEqual({
      yaml: 'model: {}',
      path: '/box/.hermes/config.yaml'
    })
    expect(mockInvoke).toHaveBeenLastCalledWith('dashboard_request', {
      request: {
        body: undefined,
        method: 'GET',
        path: '/api/config/raw?profile=crypto%2Fprofile',
        profile: 'crypto/profile'
      }
    })

    mockInvoke.mockResolvedValueOnce([{ name: 'web', enabled: true }])
    await getToolsets('crypto/profile')
    expect(mockInvoke).toHaveBeenLastCalledWith('dashboard_request', {
      request: {
        body: undefined,
        method: 'GET',
        path: '/api/tools/toolsets?profile=crypto%2Fprofile',
        profile: 'crypto/profile'
      }
    })
  })

  it('wraps settings, skill, toolset, and messaging admin mutations', async () => {
    mockInvoke.mockResolvedValue({ ok: true })

    await saveConfigRaw(
      `model:
  provider: nous`,
      'default'
    )
    await getConfigSchema()
    await getSkills('default')
    await toggleSkill('research/arxiv', false, 'default')
    await createSkill(
      { name: 'ops-drill', content: '---\nname: ops-drill\ndescription: Ops drill\n---\n# Ops' },
      'default'
    )
    await updateSkillContent('ops-drill', 'updated', 'default')
    await uninstallSkillFromHub('ops-drill', 'default')
    await toggleToolset('web', true, 'default')
    await setModelAssignment({ scope: 'main', provider: 'nous', model: 'Hermes-4' }, 'default')
    await getMessagingPlatforms('default')
    await updateMessagingPlatform('telegram', { enabled: true, env: { TELEGRAM_BOT_TOKEN: 'redacted' } }, 'default')
    await testMessagingPlatform('telegram', 'default')

    const calls = mockInvoke.mock.calls.map(([, payload]) => payload.request)
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'PUT', path: '/api/config/raw?profile=default' }),
        expect.objectContaining({ method: 'GET', path: '/api/config/schema' }),
        expect.objectContaining({ method: 'GET', path: '/api/skills?profile=default' }),
        expect.objectContaining({ method: 'PUT', path: '/api/skills/toggle' }),
        expect.objectContaining({ method: 'POST', path: '/api/skills' }),
        expect.objectContaining({ method: 'PUT', path: '/api/skills/content' }),
        expect.objectContaining({ method: 'POST', path: '/api/skills/hub/uninstall' }),
        expect.objectContaining({ method: 'PUT', path: '/api/tools/toolsets/web' }),
        expect.objectContaining({ method: 'POST', path: '/api/model/set?profile=default' }),
        expect.objectContaining({ method: 'GET', path: '/api/messaging/platforms?profile=default' }),
        expect.objectContaining({ method: 'PUT', path: '/api/messaging/platforms/telegram?profile=default' }),
        expect.objectContaining({ method: 'POST', path: '/api/messaging/platforms/telegram/test?profile=default' })
      ])
    )
  })
})
