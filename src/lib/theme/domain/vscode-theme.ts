export type VsCodeThemeType = 'dark' | 'light' | 'hc' | 'hcLight' | 'vs' | 'vs-dark'

export type VsCodeTokenColor = {
  name?: string
  scope?: string | string[]
  settings: {
    background?: string
    fontStyle?: string
    foreground?: string
  }
}

export type VsCodeTheme = {
  name: string
  type: VsCodeThemeType
  colors: Record<string, string>
  tokenColors?: VsCodeTokenColor[]
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, unknown>
}

export type ThemeCssVariable =
  | '--bits-canvas'
  | '--bits-surface'
  | '--bits-surface-raised'
  | '--bits-overlay'
  | '--bits-ink'
  | '--bits-ink-muted'
  | '--bits-ink-bright'
  | '--bits-primary'
  | '--bits-secondary'
  | '--bits-success'
  | '--bits-warning'
  | '--bits-danger'
  | '--bits-line'
  | '--bits-line-strong'
  | '--bits-focus'
  | '--bits-input'
  | '--bits-chat-scroll'
  | '--bits-tool-bg'

export type AppTheme = {
  id: string
  source: VsCodeTheme
  cssVariables: Record<ThemeCssVariable, string>
  colorScheme: 'dark' | 'light'
}

const DEFAULT_THEME_FALLBACKS: Record<ThemeCssVariable, string> = {
  '--bits-canvas': '#000000',
  '--bits-surface': '#000000',
  '--bits-surface-raised': '#050505',
  '--bits-overlay': 'rgba(0, 0, 0, 0.85)',
  '--bits-ink': '#f8f8f2',
  '--bits-ink-muted': '#6272a4',
  '--bits-ink-bright': '#ffffff',
  '--bits-primary': '#8be9fd',
  '--bits-secondary': '#bd93f9',
  '--bits-success': '#50fa7b',
  '--bits-warning': '#ff79c6',
  '--bits-danger': '#ff5555',
  '--bits-line': '#333333',
  '--bits-line-strong': '#555555',
  '--bits-focus': '#8be9fd',
  '--bits-input': '#050505',
  '--bits-chat-scroll': 'rgba(0, 0, 0, 0.2)',
  '--bits-tool-bg': 'rgba(0, 0, 0, 0.4)'
}

const COLOR_MAPPINGS: Record<ThemeCssVariable, readonly string[]> = {
  '--bits-canvas': ['editor.background'],
  '--bits-surface': ['sideBar.background', 'panel.background', 'editorGroupHeader.tabsBackground', 'editor.background'],
  '--bits-surface-raised': ['editorWidget.background', 'sideBarSectionHeader.background', 'menu.selectionBackground'],
  '--bits-overlay': ['menu.background', 'dropdown.background', 'editorHoverWidget.background'],
  '--bits-ink': ['foreground', 'editor.foreground'],
  '--bits-ink-muted': ['descriptionForeground', 'disabledForeground', 'editorLineNumber.foreground'],
  '--bits-ink-bright': ['editor.foreground', 'foreground'],
  '--bits-primary': ['terminal.ansiCyan', 'focusBorder', 'textLink.foreground'],
  '--bits-secondary': ['terminal.ansiMagenta', 'button.secondaryForeground', 'terminal.ansiBlue'],
  '--bits-success': ['terminal.ansiGreen', 'testing.iconPassed'],
  '--bits-warning': ['editorWarning.foreground', 'terminal.ansiYellow', 'problemsWarningIcon.foreground'],
  '--bits-danger': ['errorForeground', 'terminal.ansiRed', 'problemsErrorIcon.foreground'],
  '--bits-line': ['panel.border', 'sideBar.border', 'editorGroup.border'],
  '--bits-line-strong': ['contrastBorder', 'focusBorder', 'panelSection.border'],
  '--bits-focus': ['focusBorder', 'terminal.ansiCyan', 'textLink.activeForeground'],
  '--bits-input': ['input.background', 'dropdown.background', 'editor.background'],
  '--bits-chat-scroll': ['scrollbarSlider.background', 'editorOverviewRuler.border'],
  '--bits-tool-bg': ['editorHoverWidget.background', 'peekViewEditor.background', 'menu.background']
}

export function cssVariablesFromVsCodeTheme(theme: VsCodeTheme): Record<ThemeCssVariable, string> {
  return Object.fromEntries(
    Object.entries(COLOR_MAPPINGS).map(([variable, colorKeys]) => [
      variable,
      firstThemeColor(theme.colors, colorKeys) ?? DEFAULT_THEME_FALLBACKS[variable as ThemeCssVariable]
    ])
  ) as Record<ThemeCssVariable, string>
}

export function createAppTheme(id: string, source: VsCodeTheme): AppTheme {
  return {
    id,
    source,
    cssVariables: cssVariablesFromVsCodeTheme(source),
    colorScheme: themeColorScheme(source.type)
  }
}

export function themeStyleAttribute(theme: Pick<AppTheme, 'cssVariables'>): string {
  return Object.entries(theme.cssVariables)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')
}

function firstThemeColor(colors: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = colors[key]?.trim()
    if (value) return value
  }

  return undefined
}

function themeColorScheme(type: VsCodeThemeType): 'dark' | 'light' {
  if (type === 'light' || type === 'hcLight' || type === 'vs') return 'light'

  return 'dark'
}
