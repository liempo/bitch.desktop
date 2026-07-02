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
  | '--bits-surface-muted'
  | '--bits-surface-raised'
  | '--bits-overlay'
  | '--bits-ink'
  | '--bits-ink-muted'
  | '--bits-ink-faint'
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

type RgbaColor = {
  a: number
  b: number
  g: number
  r: number
}

const SCHEME_FALLBACKS: Record<'dark' | 'light', Record<ThemeCssVariable, string>> = {
  dark: {
    '--bits-canvas': '#000000',
    '--bits-surface': '#000000',
    '--bits-surface-muted': '#030303',
    '--bits-surface-raised': '#050505',
    '--bits-overlay': 'rgba(0, 0, 0, 0.85)',
    '--bits-ink': '#f8f8f2',
    '--bits-ink-muted': '#6272a4',
    '--bits-ink-faint': '#414868',
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
  },
  light: {
    '--bits-canvas': '#ffffff',
    '--bits-surface': '#f7f7f7',
    '--bits-surface-muted': '#f2f2f2',
    '--bits-surface-raised': '#ebebeb',
    '--bits-overlay': 'rgba(255, 255, 255, 0.88)',
    '--bits-ink': '#1f2328',
    '--bits-ink-muted': '#5f6a72',
    '--bits-ink-faint': '#87909a',
    '--bits-ink-bright': '#000000',
    '--bits-primary': '#005fb8',
    '--bits-secondary': '#6f42c1',
    '--bits-success': '#1a7f37',
    '--bits-warning': '#9a6700',
    '--bits-danger': '#cf222e',
    '--bits-line': '#c8cdd2',
    '--bits-line-strong': '#8c959f',
    '--bits-focus': '#005fb8',
    '--bits-input': '#ffffff',
    '--bits-chat-scroll': 'rgba(31, 35, 40, 0.06)',
    '--bits-tool-bg': 'rgba(31, 35, 40, 0.05)'
  }
}

const COLOR_MAPPINGS: Record<ThemeCssVariable, readonly string[]> = {
  '--bits-canvas': ['editor.background'],
  '--bits-surface': ['sideBar.background', 'panel.background', 'editorGroupHeader.tabsBackground', 'editor.background'],
  '--bits-surface-muted': [
    'sideBarSectionHeader.background',
    'list.inactiveSelectionBackground',
    'editorGroupHeader.tabsBackground',
    'panel.background',
    'sideBar.background',
    'editor.background'
  ],
  '--bits-surface-raised': ['editorWidget.background', 'sideBarSectionHeader.background', 'menu.selectionBackground'],
  '--bits-overlay': ['menu.background', 'dropdown.background', 'editorHoverWidget.background'],
  '--bits-ink': ['foreground', 'editor.foreground'],
  '--bits-ink-muted': ['descriptionForeground', 'disabledForeground', 'editorLineNumber.foreground'],
  '--bits-ink-faint': ['disabledForeground', 'editorLineNumber.foreground'],
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
  const colorScheme = themeColorScheme(theme.type)
  const fallback = SCHEME_FALLBACKS[colorScheme]
  const raw = rawCssVariablesFromVsCodeTheme(theme)

  const canvas = raw['--bits-canvas'] ?? fallback['--bits-canvas']
  const ink = raw['--bits-ink'] ?? fallback['--bits-ink']
  const inkBright = raw['--bits-ink-bright'] ?? ink
  const inkMuted =
    raw['--bits-ink-muted'] ?? mixCss(canvas, ink, colorScheme === 'dark' ? 0.48 : 0.55) ?? fallback['--bits-ink-muted']
  const inkFaint =
    raw['--bits-ink-faint'] ??
    mixCss(canvas, inkMuted, colorScheme === 'dark' ? 0.65 : 0.58) ??
    fallback['--bits-ink-faint']
  const surface =
    raw['--bits-surface'] ?? mixCss(canvas, ink, colorScheme === 'dark' ? 0.04 : 0.035) ?? fallback['--bits-surface']
  const surfaceMuted =
    raw['--bits-surface-muted'] ??
    mixCss(canvas, ink, colorScheme === 'dark' ? 0.025 : 0.025) ??
    fallback['--bits-surface-muted']
  const surfaceRaised = ensureContrastFromBackground(
    raw['--bits-surface-raised'] ??
      mixCss(surface, ink, colorScheme === 'dark' ? 0.06 : 0.055) ??
      fallback['--bits-surface-raised'],
    surface,
    ink,
    1.04
  )
  const primary = raw['--bits-primary'] ?? fallback['--bits-primary']
  const secondary = raw['--bits-secondary'] ?? fallback['--bits-secondary']
  const success = raw['--bits-success'] ?? fallback['--bits-success']
  const warning = raw['--bits-warning'] ?? fallback['--bits-warning']
  const danger = raw['--bits-danger'] ?? fallback['--bits-danger']
  const focus = raw['--bits-focus'] ?? primary
  const line = ensureContrastFromBackground(
    raw['--bits-line'] ?? mixCss(surface, inkMuted, 0.42) ?? fallback['--bits-line'],
    surface,
    inkMuted,
    1.55
  )
  const lineStrong = ensureContrastFromBackground(raw['--bits-line-strong'] ?? focus, surface, focus, 2.05)
  const input = ensureContrastFromBackground(raw['--bits-input'] ?? surfaceRaised, canvas, ink, 1.04)

  return {
    '--bits-canvas': canvas,
    '--bits-surface': surface,
    '--bits-surface-muted': ensureContrastFromBackground(surfaceMuted, canvas, ink, 1.025),
    '--bits-surface-raised': surfaceRaised,
    '--bits-overlay':
      raw['--bits-overlay'] ?? alphaCss(canvas, colorScheme === 'dark' ? 0.86 : 0.9) ?? fallback['--bits-overlay'],
    '--bits-ink': ink,
    '--bits-ink-muted': inkMuted,
    '--bits-ink-faint': inkFaint,
    '--bits-ink-bright': inkBright,
    '--bits-primary': primary,
    '--bits-secondary': secondary,
    '--bits-success': success,
    '--bits-warning': warning,
    '--bits-danger': danger,
    '--bits-line': line,
    '--bits-line-strong': lineStrong,
    '--bits-focus': focus,
    '--bits-input': input,
    '--bits-chat-scroll':
      raw['--bits-chat-scroll'] ??
      alphaCss(ink, colorScheme === 'dark' ? 0.08 : 0.06) ??
      fallback['--bits-chat-scroll'],
    '--bits-tool-bg':
      raw['--bits-tool-bg'] ?? alphaCss(ink, colorScheme === 'dark' ? 0.1 : 0.05) ?? fallback['--bits-tool-bg']
  }
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

function rawCssVariablesFromVsCodeTheme(theme: VsCodeTheme): Partial<Record<ThemeCssVariable, string>> {
  return Object.fromEntries(
    Object.entries(COLOR_MAPPINGS).map(([variable, colorKeys]) => [variable, firstThemeColor(theme.colors, colorKeys)])
  ) as Partial<Record<ThemeCssVariable, string>>
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

function ensureContrastFromBackground(
  value: string,
  background: string,
  preferred: string,
  minimumRatio: number
): string {
  const parsedBackground = parseCssColor(background)
  const parsedPreferred = parseCssColor(preferred)
  const parsedValue = parseCssColor(value)

  if (!parsedBackground || !parsedPreferred || !parsedValue) return value

  const opaqueBackground = compositeOver(parsedBackground, parsedBackground)
  const opaqueValue = compositeOver(parsedValue, opaqueBackground)
  if (contrastRatio(opaqueValue, opaqueBackground) >= minimumRatio) return value

  for (const amount of [0.035, 0.055, 0.08, 0.12, 0.18, 0.24, 0.3, 0.36, 0.44, 0.52, 0.62, 0.72]) {
    const candidate = mixColors(opaqueBackground, parsedPreferred, amount)
    if (contrastRatio(candidate, opaqueBackground) >= minimumRatio) return colorToHex(candidate)
  }

  return colorToHex(mixColors(opaqueBackground, parsedPreferred, 0.78))
}

function mixCss(from: string, to: string, amount: number): string | undefined {
  const fromColor = parseCssColor(from)
  const toColor = parseCssColor(to)
  if (!fromColor || !toColor) return undefined

  return colorToHex(mixColors(fromColor, toColor, amount))
}

function alphaCss(value: string, alpha: number): string | undefined {
  const color = parseCssColor(value)
  if (!color) return undefined

  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${clamp(alpha, 0, 1)})`
}

function parseCssColor(value: string): RgbaColor | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'transparent') return { a: 0, b: 0, g: 0, r: 0 }

  if (normalized.startsWith('#')) return parseHexColor(normalized)

  const rgbMatch = normalized.match(/^rgba?\((.+)\)$/)
  if (!rgbMatch) return undefined

  return parseRgbColor(rgbMatch[1])
}

function parseHexColor(value: string): RgbaColor | undefined {
  const hex = value.slice(1)
  if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/i.test(hex)) return undefined

  const expanded = hex.length <= 4 ? [...hex].map(character => character + character).join('') : hex
  const r = Number.parseInt(expanded.slice(0, 2), 16)
  const g = Number.parseInt(expanded.slice(2, 4), 16)
  const b = Number.parseInt(expanded.slice(4, 6), 16)
  const a = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1

  return { a, b, g, r }
}

function parseRgbColor(value: string): RgbaColor | undefined {
  const parts = value.includes(',')
    ? value.split(',').map(part => part.trim())
    : value
        .replace('/', ' ')
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean)

  if (parts.length < 3) return undefined

  const r = parseCssChannel(parts[0])
  const g = parseCssChannel(parts[1])
  const b = parseCssChannel(parts[2])
  const a = parts[3] === undefined ? 1 : parseCssAlpha(parts[3])

  if ([r, g, b, a].some(part => !Number.isFinite(part))) return undefined

  return { a: clamp(a, 0, 1), b: clamp(b, 0, 255), g: clamp(g, 0, 255), r: clamp(r, 0, 255) }
}

function parseCssChannel(value: string): number {
  if (value.endsWith('%')) return (Number.parseFloat(value) / 100) * 255

  return Number.parseFloat(value)
}

function parseCssAlpha(value: string): number {
  if (value.endsWith('%')) return Number.parseFloat(value) / 100

  return Number.parseFloat(value)
}

function contrastRatio(left: RgbaColor, right: RgbaColor): number {
  const leftLuminance = relativeLuminance(left)
  const rightLuminance = relativeLuminance(right)
  const lighter = Math.max(leftLuminance, rightLuminance)
  const darker = Math.min(leftLuminance, rightLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(color: RgbaColor): number {
  const [r, g, b] = [color.r, color.g, color.b].map(channel => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function compositeOver(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.a + background.a * (1 - foreground.a)
  if (alpha <= 0) return { a: 0, b: 0, g: 0, r: 0 }

  return {
    a: alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha
  }
}

function mixColors(from: RgbaColor, to: RgbaColor, amount: number): RgbaColor {
  const weight = clamp(amount, 0, 1)

  return {
    a: from.a + (to.a - from.a) * weight,
    b: from.b + (to.b - from.b) * weight,
    g: from.g + (to.g - from.g) * weight,
    r: from.r + (to.r - from.r) * weight
  }
}

function colorToHex(color: RgbaColor): string {
  return `#${[color.r, color.g, color.b]
    .map(channel =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
