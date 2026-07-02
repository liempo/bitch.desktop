// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SettingsPage from '../../settings/SettingsPage.svelte'
import * as platform from '$lib/platform'
import * as theme from '$lib/theme'
import type { VsCodeMarketplaceThemeExtension } from '$lib/theme'

const marketplaceExtension: VsCodeMarketplaceThemeExtension = {
  averageRating: 4.8,
  displayName: 'Dracula Official',
  extensionId: 'dracula-theme.theme-dracula',
  extensionName: 'theme-dracula',
  iconUrl: undefined,
  installCount: 123456,
  marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=dracula-theme.theme-dracula',
  packageUrl:
    'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/dracula-theme/vsextensions/theme-dracula/latest/vspackage',
  publisherDisplayName: 'Dracula Theme',
  publisherName: 'dracula-theme',
  ratingCount: 1200,
  shortDescription: 'A dark theme for people who enjoy readable coffins.',
  themes: [{ label: 'Dracula', uiTheme: 'vs-dark' }],
  version: '1.0.0'
}

function resetThemeState(): void {
  localStorage.clear()
  theme.replaceImportedThemes([], localStorage)
  theme.selectTheme(theme.DEFAULT_THEME_ID, localStorage)
  document.body.removeAttribute('style')
}

beforeEach(() => {
  resetThemeState()
  vi.spyOn(platform, 'openExternalUrl').mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetThemeState()
})

describe('SettingsPage UI', () => {
  it('renders the Appearance controls and applies theme selections through the theme state', async () => {
    const user = userEvent.setup()

    render(SettingsPage)

    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Control surface' })).toBeInTheDocument()

    const themeSelector = screen.getByRole('combobox', { name: 'Theme' })
    expect(themeSelector).toHaveValue('bitch')

    await user.selectOptions(themeSelector, 'terminal-green')

    expect(theme.themeState.selectedThemeId).toBe('terminal-green')
    expect(themeSelector).toHaveValue('terminal-green')
  })

  it('opens the VS Code theme picker dialog and uninstalls installed Marketplace themes', async () => {
    const user = userEvent.setup()
    const importedTheme = theme.createAppTheme('vscode-extension:probe-theme', {
      colors: { 'editor.background': '#101010', foreground: '#f8f8f2' },
      name: 'Probe Theme',
      type: 'dark'
    })
    theme.replaceImportedThemes([importedTheme], localStorage)

    render(SettingsPage)

    await user.click(screen.getByRole('button', { name: 'Open VS Code theme picker' }))

    const dialog = screen.getByRole('dialog', { name: 'VS Code Theme Picker' })
    expect(within(dialog).getByRole('list', { name: 'Installed VS Code themes and extensions' })).toBeInTheDocument()
    expect(within(dialog).getByText('Probe Theme')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Uninstall' }))

    expect(theme.installedThemeOptions()).toEqual([])
    expect(screen.getAllByRole('status').some(status => status.textContent === 'Uninstalled Probe Theme.')).toBe(true)
  })

  it('searches the Marketplace, installs color-theme VSIX packages, and opens Marketplace links', async () => {
    const user = userEvent.setup()
    const importedTheme = theme.createAppTheme('vscode-extension:dracula-theme-theme-dracula', {
      colors: { 'editor.background': '#282a36', foreground: '#f8f8f2' },
      name: 'Dracula',
      type: 'dark'
    })
    const searchSpy = vi.spyOn(theme, 'searchVsCodeMarketplaceThemes').mockResolvedValue({
      extensions: [marketplaceExtension],
      page: 1,
      pageSize: 12,
      scanned: 4,
      totalThemeCategoryMatches: 4
    })
    const installSpy = vi.spyOn(theme, 'importAndUseVsCodeMarketplaceThemeExtension').mockImplementation(async () => {
      theme.replaceImportedThemes([importedTheme], localStorage)
      theme.selectTheme(importedTheme.id, localStorage)
      return { errors: [], themes: [importedTheme] }
    })

    render(SettingsPage)

    await user.click(screen.getByRole('button', { name: 'Open VS Code theme picker' }))
    const dialog = screen.getByRole('dialog', { name: 'VS Code Theme Picker' })

    await user.type(within(dialog).getByRole('searchbox', { name: 'Search Marketplace themes' }), 'dracula')
    await user.click(within(dialog).getByRole('button', { name: 'Search theme marketplace' }))

    await waitFor(() => {
      expect(searchSpy).toHaveBeenCalledWith({ query: 'dracula', pageSize: 12 })
    })
    expect(await within(dialog).findByText(/Showing 1 color-theme extension/)).toBeInTheDocument()
    expect(within(dialog).getByText('Dracula Official')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Install' }))

    await waitFor(() => {
      expect(installSpy).toHaveBeenCalledWith(marketplaceExtension)
    })
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Installed 1 theme from Dracula Official; applied Dracula.'
    )

    await user.click(within(dialog).getByRole('button', { name: 'Open' }))

    expect(platform.openExternalUrl).toHaveBeenCalledWith(marketplaceExtension.marketplaceUrl)
  })
})
