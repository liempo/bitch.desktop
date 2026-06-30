import { readNamespacedStorageItem, writeNamespacedStorageItem } from '$lib/storage'

import { downloadVsCodeMarketplaceThemeExtensionPackage } from './adapters/vscode-marketplace'
import {
  deserializeImportedThemes,
  importVsCodeExtensionThemes,
  serializeImportedThemes,
  type VsCodeThemeFile
} from './domain/vscode-extension-theme'
import { createAppTheme, themeStyleAttribute, type AppTheme, type VsCodeTheme } from './domain/vscode-theme'
import type { VsCodeMarketplaceThemeExtension } from './domain/vscode-marketplace'

export const THEME_STORAGE_SUFFIX = 'theme.v1'
export const IMPORTED_THEMES_STORAGE_SUFFIX = 'themes.imported.v1'
export const DEFAULT_THEME_ID = 'bitch'

const BITCH_THEME_SOURCE: VsCodeTheme = {
  name: 'BITCH',
  type: 'dark',
  colors: {
    'editor.background': '#000000',
    'sideBar.background': '#000000',
    'editorWidget.background': '#050505',
    'menu.background': 'rgba(0, 0, 0, 0.85)',
    foreground: '#f8f8f2',
    descriptionForeground: '#6272a4',
    'editor.foreground': '#ffffff',
    'terminal.ansiCyan': '#8be9fd',
    'terminal.ansiMagenta': '#bd93f9',
    'terminal.ansiGreen': '#50fa7b',
    'editorWarning.foreground': '#ff79c6',
    errorForeground: '#ff5555',
    'panel.border': '#333333',
    contrastBorder: '#555555',
    focusBorder: '#8be9fd',
    'input.background': '#050505',
    'scrollbarSlider.background': 'rgba(0, 0, 0, 0.2)',
    'editorHoverWidget.background': 'rgba(0, 0, 0, 0.4)'
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#6272a4' } },
    { scope: ['string', 'constant.other.symbol'], settings: { foreground: '#50fa7b' } },
    { scope: ['keyword', 'storage'], settings: { foreground: '#ff79c6' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#8be9fd' } }
  ],
  semanticTokenColors: {
    function: '#8be9fd',
    keyword: '#ff79c6',
    string: '#50fa7b',
    variable: '#f8f8f2'
  }
}

const TERMINAL_GREEN_THEME_SOURCE: VsCodeTheme = {
  name: 'Terminal Green',
  type: 'dark',
  colors: {
    'editor.background': '#010400',
    'sideBar.background': '#020700',
    'editorWidget.background': '#061006',
    'menu.background': 'rgba(1, 4, 0, 0.88)',
    foreground: '#d8ffd8',
    descriptionForeground: '#5b8f67',
    'editor.foreground': '#f4fff4',
    'terminal.ansiCyan': '#7cff7c',
    'terminal.ansiMagenta': '#7dffbf',
    'terminal.ansiGreen': '#aaff80',
    'editorWarning.foreground': '#f4ff75',
    errorForeground: '#ff6f6f',
    'panel.border': '#1d3d24',
    contrastBorder: '#3e7a4a',
    focusBorder: '#7cff7c',
    'input.background': '#030b03',
    'scrollbarSlider.background': 'rgba(1, 8, 1, 0.2)',
    'editorHoverWidget.background': 'rgba(3, 14, 3, 0.58)'
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#5b8f67' } },
    { scope: ['string', 'constant.other.symbol'], settings: { foreground: '#aaff80' } },
    { scope: ['keyword', 'storage'], settings: { foreground: '#f4ff75' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#7cff7c' } }
  ],
  semanticTokenColors: {
    function: '#7cff7c',
    keyword: '#f4ff75',
    string: '#aaff80',
    variable: '#d8ffd8'
  }
}

export const builtInThemes = [
  createAppTheme(DEFAULT_THEME_ID, BITCH_THEME_SOURCE),
  createAppTheme('terminal-green', TERMINAL_GREEN_THEME_SOURCE)
] as const satisfies readonly AppTheme[]

export const themeOptions = $state<AppTheme[]>([...builtInThemes])

const defaultTheme = builtInThemes[0]

export const themeState = $state({
  selectedThemeId: defaultTheme.id,
  selectedTheme: defaultTheme
})

export function currentThemeStyleAttribute(): string {
  return themeStyleAttribute(themeState.selectedTheme)
}

export function resolveThemeSelection(themeId?: null | string): AppTheme {
  const normalized = themeId?.trim()
  if (!normalized) return defaultTheme

  return themeOptions.find(theme => theme.id === normalized) ?? defaultTheme
}

export function loadImportedThemes(storage?: Storage): AppTheme[] {
  return deserializeImportedThemes(readNamespacedStorageItem(IMPORTED_THEMES_STORAGE_SUFFIX, storage))
}

export function replaceImportedThemes(themes: readonly AppTheme[], storage?: Storage): AppTheme[] {
  const imported = uniqueThemesById(themes)
  themeOptions.splice(0, themeOptions.length, ...builtInThemes, ...imported)
  writeNamespacedStorageItem(IMPORTED_THEMES_STORAGE_SUFFIX, serializeImportedThemes(imported), storage)
  return imported
}

export function installedThemeOptions(): AppTheme[] {
  const builtInIds = new Set(builtInThemes.map(theme => theme.id))
  return themeOptions.filter(theme => !builtInIds.has(theme.id))
}

export function uninstallImportedTheme(themeId: string, storage?: Storage): AppTheme[] {
  const imported = loadImportedThemes(storage).filter(theme => theme.id !== themeId)
  const persistedThemeId = readNamespacedStorageItem(THEME_STORAGE_SUFFIX, storage)
  replaceImportedThemes(imported, storage)

  if (themeState.selectedThemeId === themeId || persistedThemeId === themeId) {
    updateThemeState(persistThemeSelection(DEFAULT_THEME_ID, storage))
  }

  return imported
}

export async function importAndUseVsCodeExtensionThemes(files: Iterable<VsCodeThemeFile>, storage?: Storage) {
  const result = await importVsCodeExtensionThemes(files)

  if (result.themes.length > 0) {
    replaceImportedThemes([...loadImportedThemes(storage), ...result.themes], storage)
    updateThemeState(persistThemeSelection(result.themes[0].id, storage))
  }

  return result
}

export async function importAndUseVsCodeMarketplaceThemeExtension(
  extension: VsCodeMarketplaceThemeExtension,
  storage?: Storage
) {
  const files = await downloadVsCodeMarketplaceThemeExtensionPackage(extension)
  return importAndUseVsCodeExtensionThemes(files, storage)
}

export function loadThemeSelection(storage?: Storage): AppTheme {
  replaceImportedThemes(loadImportedThemes(storage), storage)
  return resolveThemeSelection(readNamespacedStorageItem(THEME_STORAGE_SUFFIX, storage))
}

export function persistThemeSelection(themeId: string, storage?: Storage): AppTheme {
  const theme = resolveThemeSelection(themeId)
  writeNamespacedStorageItem(THEME_STORAGE_SUFFIX, theme.id, storage)
  return theme
}

export function initializeThemeSelection(storage?: Storage): AppTheme {
  return updateThemeState(loadThemeSelection(storage))
}

export function selectTheme(themeId: string, storage?: Storage): AppTheme {
  return updateThemeState(persistThemeSelection(themeId, storage))
}

function uniqueThemesById(themes: readonly AppTheme[]): AppTheme[] {
  return [...new Map(themes.map(theme => [theme.id, theme])).values()]
}

function updateThemeState(theme: AppTheme): AppTheme {
  themeState.selectedThemeId = theme.id
  themeState.selectedTheme = theme
  return theme
}
