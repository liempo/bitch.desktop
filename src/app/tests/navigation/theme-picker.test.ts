import { describe, expect, it } from 'vitest'

import appCssSource from '../../../app.css?raw'
import appShellSource from '../../AppShell.svelte?raw'
import dialogSource from '../../components/ui/Dialog.svelte?raw'

describe('theme shell source contracts', () => {
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

  it('carries the active runtime theme into portal dialogs', () => {
    expect(dialogSource).toContain("import { currentThemeStyleAttribute, themeState } from '$lib/theme'")
    expect(dialogSource).toContain('const portalThemeStyle = $derived(currentThemeStyleAttribute())')
    expect(dialogSource).toContain('data-theme={themeState.selectedThemeId}')
    expect(dialogSource).toContain('data-theme-type={themeState.selectedTheme.source.type}')
    expect(dialogSource).toContain('style={portalThemeStyle}')
  })

  it('keeps color themes centralized outside app.css data-theme blocks', () => {
    expect(appCssSource).not.toContain("[data-theme='terminal-green']")
    expect(appCssSource).not.toContain("[data-theme='cyberpunk']")
  })
})
