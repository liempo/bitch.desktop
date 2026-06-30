import { describe, expect, it } from 'vitest'

import appShellSource from '../../AppShell.svelte?raw'
import settingsPageSource from '../../settings/SettingsPage.svelte?raw'
import navSource from '../../navigation/AppNavbar.svelte?raw'
import routerSource from '../../router.svelte.ts?raw'
import { settingsRoute } from '../../router.svelte'

describe('settings page route contract', () => {
  it('adds Settings as a top-level route and navbar destination', () => {
    expect((settingsRoute as () => string)()).toBe('/settings')
    expect(routerSource).toContain("'settings'")
    expect(routerSource).toContain('settingsRoute')
    expect(appShellSource).toContain("settings: () => import('./settings/SettingsPage.svelte')")
    expect(navSource).toContain("label: 'SETTINGS'")
    expect(navSource).toContain('settingsRoute()')
  })

  it('renders theme controls on the Settings page instead of only in the navbar', () => {
    expect(settingsPageSource).toContain("import Panel from '@/app/components/ui/Panel.svelte'")
    expect(settingsPageSource).toContain("import MarketplaceThemeBrowser from './MarketplaceThemeBrowser.svelte'")
    expect(settingsPageSource).toContain(
      "import { importAndUseVsCodeExtensionThemes, selectTheme, themeOptions, themeState } from '$lib/theme'"
    )
    expect(settingsPageSource).toContain('aria-label="Settings"')
    expect(settingsPageSource).toContain('Appearance')
    expect(settingsPageSource).toContain('bind:value={themeState.selectedThemeId}')
    expect(settingsPageSource).toContain('onchange={handleThemeChange}')
    expect(settingsPageSource).toContain('VS Code extension themes')
    expect(settingsPageSource).toContain('function handleVsCodeThemeBrowse')
    expect(settingsPageSource).toContain('importAndUseVsCodeExtensionThemes(target.files)')
    expect(settingsPageSource).toContain('webkitdirectory')
    expect(settingsPageSource).toContain('accept=".json,application/json"')
    expect(settingsPageSource).toContain('<MarketplaceThemeBrowser />')
  })
})
