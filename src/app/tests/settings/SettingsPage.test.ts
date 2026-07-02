import { describe, expect, it } from 'vitest'

import appShellSource from '../../AppShell.svelte?raw'
import settingsPageSource from '../../settings/SettingsPage.svelte?raw'
import navSource from '../../navigation/AppNavbar.svelte?raw'
import routerSource from '../../router.svelte.ts?raw'
import { settingsRoute } from '../../router.svelte'

describe('settings page source contracts', () => {
  it('keeps Settings as a lazy top-level route and navbar destination', () => {
    expect((settingsRoute as () => string)()).toBe('/settings')
    expect(routerSource).toContain("'settings'")
    expect(routerSource).toContain('settingsRoute')
    expect(appShellSource).toContain("settings: () => import('./settings/SettingsPage.svelte')")
    expect(navSource).toContain("label: 'SETTINGS'")
    expect(navSource).toContain('settingsRoute()')
  })

  it('does not expose the removed in-app source updater', () => {
    expect(settingsPageSource).not.toContain('Source updater')
    expect(settingsPageSource).not.toContain('BITCH_SRC_DIR')
    expect(settingsPageSource).not.toContain('Source main install')
    expect(settingsPageSource).not.toContain('Install latest main')
    expect(settingsPageSource).not.toContain('sourceUpdateSteps')
    expect(settingsPageSource).not.toContain('checkSourceUpdate')
    expect(settingsPageSource).not.toContain('runSourceUpdate')
  })
})
