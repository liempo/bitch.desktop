import { describe, expect, it } from 'vitest'

import { namespacedStorageKey } from '$lib/storage'
import {
  DEFAULT_THEME_ID,
  IMPORTED_THEMES_STORAGE_SUFFIX,
  THEME_STORAGE_SUFFIX,
  builtInThemes,
  cssVariablesFromVsCodeTheme,
  deserializeImportedThemes,
  importAndUseVsCodeExtensionThemes,
  importVsCodeExtensionThemes,
  loadThemeSelection,
  replaceImportedThemes,
  persistThemeSelection,
  resolveThemeSelection,
  themeStyleAttribute,
  themeOptions,
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

  it('imports VS Code color themes from an unpacked extension manifest', async () => {
    const result = await importVsCodeExtensionThemes([
      file('probe/package.json', {
        name: 'probe-theme-extension',
        publisher: 'liempo',
        contributes: {
          themes: [{ id: 'night-city', label: 'Night City', uiTheme: 'vs-dark', path: './themes/night-city.json' }]
        }
      }),
      file('probe/themes/night-city.json', {
        name: 'Night City Theme',
        colors: {
          'editor.background': '#120018',
          'sideBar.background': '#180020',
          foreground: '#f4e8ff',
          focusBorder: '#ff33cc'
        },
        tokenColors: [{ scope: 'keyword', settings: { foreground: '#ff33cc' } }]
      })
    ])

    expect(result.errors).toEqual([])
    expect(result.themes).toHaveLength(1)
    expect(result.themes[0]).toMatchObject({
      id: 'vscode-extension:liempo-probe-theme-extension-night-city-probe-themes-night-city-json',
      source: { name: 'Night City Theme', type: 'vs-dark' },
      cssVariables: expect.objectContaining({
        '--bits-canvas': '#120018',
        '--bits-surface': '#180020',
        '--bits-focus': '#ff33cc'
      })
    })
  })

  it('imports standalone VS Code theme JSON files and persists them for selection', async () => {
    const storage = storageStub()
    const result = await importAndUseVsCodeExtensionThemes(
      [
        file('synthetic.json', {
          name: 'Synthetic Light',
          type: 'light',
          colors: { 'editor.background': '#fafafa', foreground: '#111111', focusBorder: '#0055ff' }
        })
      ],
      storage
    )

    expect(result.themes).toHaveLength(1)
    expect(result.themes[0].colorScheme).toBe('light')
    expect(storage.getItem(namespacedStorageKey(THEME_STORAGE_SUFFIX))).toBe(result.themes[0].id)
    expect(
      deserializeImportedThemes(storage.getItem(namespacedStorageKey(IMPORTED_THEMES_STORAGE_SUFFIX)))
    ).toHaveLength(1)
    expect(themeOptions.map(theme => theme.id)).toContain(result.themes[0].id)

    replaceImportedThemes([...result.themes, ...result.themes], storage)

    expect(themeOptions.filter(theme => theme.id === result.themes[0].id)).toHaveLength(1)
  })

  it('loads imported themes before resolving a persisted custom theme id', () => {
    const imported = importTheme('Persisted Corpo Blue', '#001122')
    const storage = storageStub({
      [namespacedStorageKey(IMPORTED_THEMES_STORAGE_SUFFIX)]: JSON.stringify([
        { id: imported.id, source: imported.source }
      ]),
      [namespacedStorageKey(THEME_STORAGE_SUFFIX)]: imported.id
    })

    expect(loadThemeSelection(storage).id).toBe(imported.id)
    replaceImportedThemes([], storage)
  })

  it('renders a CSS style attribute from the theme adapter rather than hardcoded data-theme blocks', () => {
    const theme = resolveThemeSelection('terminal-green')

    expect(themeStyleAttribute(theme)).toContain('--bits-canvas: #010400;')
    expect(themeStyleAttribute(theme)).toContain('--bits-primary: #7cff7c;')
  })
})

function file(path: string, body: unknown) {
  return {
    name: path.split('/').at(-1) ?? path,
    webkitRelativePath: path,
    text: async () => JSON.stringify(body)
  }
}

function importTheme(name: string, background: string) {
  return deserializeImportedThemes(
    JSON.stringify([
      {
        id: `vscode-extension:${name.toLowerCase().replaceAll(' ', '-')}`,
        source: { name, type: 'dark', colors: { 'editor.background': background, foreground: '#ffffff' } }
      }
    ])
  )[0]
}
