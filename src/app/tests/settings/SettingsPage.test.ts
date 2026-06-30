import { describe, expect, it } from 'vitest'

import appShellSource from '../../AppShell.svelte?raw'
import marketplaceThemeBrowserSource from '../../settings/MarketplaceThemeBrowser.svelte?raw'
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
      "import { installedThemeOptions, selectTheme, themeOptions, themeState, uninstallImportedTheme } from '$lib/theme'"
    )
    expect(settingsPageSource).toContain('aria-label="Settings"')
    expect(settingsPageSource).toContain('Appearance')
    expect(settingsPageSource).toContain('bind:value={themeState.selectedThemeId}')
    expect(settingsPageSource).toContain('onchange={handleThemeChange}')
    expect(settingsPageSource).toContain('Installed themes/extensions')
    expect(settingsPageSource).toContain('installedThemeOptions()')
    expect(settingsPageSource).toContain('function handleUninstallTheme')
    expect(settingsPageSource).toContain('uninstallImportedTheme(themeId)')
    expect(settingsPageSource).toContain('Uninstall')
    expect(settingsPageSource).not.toContain('function handleVsCodeThemeBrowse')
    expect(settingsPageSource).not.toContain('webkitdirectory')
    expect(settingsPageSource).not.toContain('Browse extension folder')
    expect(settingsPageSource).not.toContain('Browse theme JSON')
    expect(settingsPageSource).toContain('<MarketplaceThemeBrowser />')
  })

  it('lets Marketplace theme browser install VSIX color themes into the local selector', () => {
    expect(marketplaceThemeBrowserSource).toContain('importAndUseVsCodeMarketplaceThemeExtension')
    expect(marketplaceThemeBrowserSource).toContain('function installMarketplaceExtension')
    expect(marketplaceThemeBrowserSource).toContain('onclick={() => installMarketplaceExtension(extension)}')
    expect(marketplaceThemeBrowserSource).toContain('Install')
    expect(marketplaceThemeBrowserSource).toContain('extension.packageUrl')
  })
})
