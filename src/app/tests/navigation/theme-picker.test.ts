import { describe, expect, it } from 'vitest'

import appCssSource from '../../../app.css?raw'
import appShellSource from '../../AppShell.svelte?raw'
import appNavbarSource from '../../navigation/AppNavbar.svelte?raw'

describe('temporary theme picker source contract', () => {
  it('mounts the selected theme through the shell instead of a hardcoded theme token', () => {
    expect(appShellSource).toContain(
      "import { currentThemeStyleAttribute, initializeThemeSelection, themeState } from '$lib/theme'"
    )
    expect(appShellSource).toContain('initializeThemeSelection()')
    expect(appShellSource).toContain('data-theme={themeState.selectedThemeId}')
    expect(appShellSource).toContain('data-theme-type={themeState.selectedTheme.source.type}')
    expect(appShellSource).toContain('style={currentThemeStyleAttribute()}')
    expect(appShellSource).not.toContain('data-theme="cyberpunk"')
  })

  it('renders a runtime theme picker beside the Kanban navigation item', () => {
    expect(appNavbarSource).toContain("label: 'KANBAN'")
    expect(appNavbarSource).toContain(
      "import { selectTheme, themeOptions, themeState, type NerdIconName } from '$lib/theme'"
    )
    expect(appNavbarSource).toContain('function handleThemeChange')
    expect(appNavbarSource).toContain('selectTheme(')
    expect(appNavbarSource).toContain('aria-label="Theme"')
    expect(appNavbarSource).toContain('{#each themeOptions as theme (theme.id)}')
    expect(appNavbarSource).toContain('value={theme.id}')
    expect(appNavbarSource).toContain('bind:value={themeState.selectedThemeId}')
  })

  it('keeps color themes centralized outside app.css data-theme blocks', () => {
    expect(appCssSource).not.toContain("[data-theme='terminal-green']")
    expect(appCssSource).not.toContain("[data-theme='cyberpunk']")
  })
})
