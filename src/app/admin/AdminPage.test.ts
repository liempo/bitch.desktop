import { describe, expect, it } from 'vitest'

import adminPageSource from './AdminPage.svelte?raw'
import appShellSource from '../AppShell.svelte?raw'
import navbarSource from '../navigation/AppNavbar.svelte?raw'
import routerSource from '../router.svelte?raw'

describe('admin utilities route contract', () => {
  it('adds an ADMIN route to the top-level shell and navbar', () => {
    expect(routerSource).toContain("'admin'")
    expect(routerSource).toContain("path === '/admin'")
    expect(routerSource).toContain('adminRoute')
    expect(appShellSource).toContain('AdminPage')
    expect(navbarSource).toContain("label: 'ADMIN'")
    expect(navbarSource).toContain('adminRoute()')
  })

  it('ports settings, skills, and messaging admin surfaces behind one remote-only page', () => {
    expect(adminPageSource).toContain("type AdminTab = 'settings' | 'skills' | 'messaging'")
    expect(adminPageSource).toContain('getGlobalModelInfo')
    expect(adminPageSource).toContain('getModelOptions')
    expect(adminPageSource).toContain('getToolsets')
    expect(adminPageSource).toContain('getConfigRaw')
    expect(adminPageSource).toContain('saveConfigRaw')
    expect(adminPageSource).toContain('getSkills')
    expect(adminPageSource).toContain('createSkill')
    expect(adminPageSource).toContain('updateSkillContent')
    expect(adminPageSource).toContain('uninstallSkillFromHub')
    expect(adminPageSource).toContain('getMessagingPlatforms')
    expect(adminPageSource).toContain('updateMessagingPlatform')
    expect(adminPageSource).toContain('testMessagingPlatform')
  })

  it('does not introduce local Hermes bootstrap or public file-server fallbacks', () => {
    expect(adminPageSource).not.toContain('BITCH_GATEWAY_URL')
    expect(adminPageSource).not.toContain('VITE_BITCH_GATEWAY')
    expect(adminPageSource).not.toContain('VITE_BOX_BASE_URL')
    expect(adminPageSource).not.toContain('dufs')
    expect(adminPageSource).not.toContain('bitch.plugin')
  })
})
