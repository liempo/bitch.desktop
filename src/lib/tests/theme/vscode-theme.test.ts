import { describe, expect, it } from 'vitest'

import { namespacedStorageKey } from '$lib/storage'
import {
  DEFAULT_THEME_ID,
  THEME_STORAGE_SUFFIX,
  builtInThemes,
  cssVariablesFromVsCodeTheme,
  loadThemeSelection,
  persistThemeSelection,
  resolveThemeSelection,
  themeStyleAttribute,
  type VsCodeTheme
} from '$lib/theme'

function storageStub(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))

  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }
}

describe('VS Code-compatible app themes', () => {
  it('maps VS Code workbench colors into the app CSS custom property contract', () => {
    const source: VsCodeTheme = {
      name: 'Probe Theme',
      type: 'dark',
      colors: {
        'editor.background': '#101010',
        'sideBar.background': '#111111',
        'editorWidget.background': '#151515',
        'menu.background': 'rgba(16, 16, 16, 0.92)',
        foreground: '#eeeeee',
        descriptionForeground: '#777777',
        'editor.foreground': '#ffffff',
        focusBorder: '#00ffff',
        'terminal.ansiCyan': '#00eeee',
        'terminal.ansiMagenta': '#ff00ee',
        'terminal.ansiGreen': '#00ff66',
        'editorWarning.foreground': '#ffff00',
        errorForeground: '#ff4444',
        'panel.border': '#333333',
        contrastBorder: '#555555',
        'input.background': '#080808',
        'scrollbarSlider.background': 'rgba(0, 0, 0, 0.25)',
        'editorHoverWidget.background': 'rgba(0, 0, 0, 0.45)'
      }
    }

    expect(cssVariablesFromVsCodeTheme(source)).toEqual({
      '--bits-canvas': '#101010',
      '--bits-surface': '#111111',
      '--bits-surface-raised': '#151515',
      '--bits-overlay': 'rgba(16, 16, 16, 0.92)',
      '--bits-ink': '#eeeeee',
      '--bits-ink-muted': '#777777',
      '--bits-ink-bright': '#ffffff',
      '--bits-primary': '#00eeee',
      '--bits-secondary': '#ff00ee',
      '--bits-success': '#00ff66',
      '--bits-warning': '#ffff00',
      '--bits-danger': '#ff4444',
      '--bits-line': '#333333',
      '--bits-line-strong': '#555555',
      '--bits-focus': '#00ffff',
      '--bits-input': '#080808',
      '--bits-chat-scroll': 'rgba(0, 0, 0, 0.25)',
      '--bits-tool-bg': 'rgba(0, 0, 0, 0.45)'
    })
  })

  it('ships the existing BITCH theme and a real alternate as VS Code-style theme sources', () => {
    const defaultTheme = resolveThemeSelection(DEFAULT_THEME_ID)

    expect(defaultTheme.id).toBe('bitch')
    expect(defaultTheme.source).toMatchObject({
      name: 'BITCH',
      type: 'dark',
      colors: expect.objectContaining({
        'editor.background': '#000000',
        'terminal.ansiCyan': '#8be9fd',
        errorForeground: '#ff5555'
      })
    })
    expect(defaultTheme.source.tokenColors).toEqual(expect.any(Array))
    expect(builtInThemes.map(theme => theme.id)).toEqual(expect.arrayContaining(['bitch', 'terminal-green']))
  })

  it('falls back to the default theme when persisted selection is missing or stale', () => {
    expect(loadThemeSelection(storageStub()).id).toBe(DEFAULT_THEME_ID)
    expect(loadThemeSelection(storageStub({ [namespacedStorageKey(THEME_STORAGE_SUFFIX)]: 'deleted-theme' })).id).toBe(
      DEFAULT_THEME_ID
    )
  })

  it('persists theme selection with the app storage namespace', () => {
    const storage = storageStub()

    const selected = persistThemeSelection('terminal-green', storage)

    expect(selected.id).toBe('terminal-green')
    expect(storage.getItem(namespacedStorageKey(THEME_STORAGE_SUFFIX))).toBe('terminal-green')
  })

  it('renders a CSS style attribute from the theme adapter rather than hardcoded data-theme blocks', () => {
    const theme = resolveThemeSelection('terminal-green')

    expect(themeStyleAttribute(theme)).toContain('--bits-canvas: #010400;')
    expect(themeStyleAttribute(theme)).toContain('--bits-primary: #7cff7c;')
  })
})
