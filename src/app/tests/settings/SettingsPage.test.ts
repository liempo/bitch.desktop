import { describe, expect, it } from 'vitest'

import appShellSource from '../../AppShell.svelte?raw'
import marketplaceThemeBrowserSource from '../../settings/MarketplaceThemeBrowser.svelte?raw'
import settingsPageSource from '../../settings/SettingsPage.svelte?raw'
import navSource from '../../navigation/AppNavbar.svelte?raw'
import routerSource from '../../router.svelte.ts?raw'
import { settingsRoute } from '../../router.svelte'

function expectAll(source: string, needles: string[]): void {
  for (const needle of needles) {
    expect(source).toContain(needle)
  }
}

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

  it('keeps Settings responsive on narrow mobile viewports', () => {
    expectAll(settingsPageSource, [
      'p-2 sm:p-3 md:p-4',
      'max-w-4xl min-w-0 gap-3',
      'contentClass="space-y-3 sm:space-y-4"',
      '!bottom-2 !left-2 !right-2 !top-2 !w-auto',
      'max-h-[calc(100dvh-5rem)]',
      'w-full self-start sm:w-auto'
    ])

    expectAll(marketplaceThemeBrowserSource, [
      'grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)]',
      'col-span-2 grid w-full gap-2 self-start sm:col-span-1 sm:w-auto',
      'break-all text-xs text-ink-muted sm:truncate',
      'w-full whitespace-normal py-2 !leading-tight disabled:cursor-wait'
    ])
  })

  it('exposes a source updater panel without versioning UI', () => {
    expect(settingsPageSource).toContain('Source updater')
    expect(settingsPageSource).toContain('BITCH_SRC_DIR')
    expect(settingsPageSource).toContain('Source main install')
    expect(settingsPageSource).toContain('npm install')
    expect(settingsPageSource).toContain('Install latest main')
    expect(settingsPageSource).toContain('sourceUpdateSteps')
    expect(settingsPageSource).toContain('Source updater steps')
    expect(settingsPageSource).toContain('checkSourceUpdate')
    expect(settingsPageSource).toContain('runSourceUpdate')
    expect(settingsPageSource).not.toMatch(/version/i)
  })
})
