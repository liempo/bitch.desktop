import { createAppTheme, type AppTheme, type VsCodeTheme, type VsCodeThemeType } from './vscode-theme'

export type VsCodeExtensionThemeContribution = {
  id?: string
  label?: string
  path?: string
  uiTheme?: string
}

export type VsCodeExtensionManifest = {
  name?: string
  displayName?: string
  publisher?: string
  contributes?: {
    themes?: VsCodeExtensionThemeContribution[]
  }
}

export type VsCodeThemeFile = {
  name: string
  webkitRelativePath?: string
  text(): Promise<string>
}

export type VsCodeExtensionThemeImportResult = {
  themes: AppTheme[]
  errors: string[]
}

const THEME_ID_PREFIX = 'vscode-extension:'

export async function importVsCodeExtensionThemes(
  files: Iterable<VsCodeThemeFile>
): Promise<VsCodeExtensionThemeImportResult> {
  const fileList = [...files]
  const byPath = indexThemeFiles(fileList)
  const manifests = fileList.filter(file => basename(filePath(file)) === 'package.json')
  const themes: AppTheme[] = []
  const errors: string[] = []

  for (const manifestFile of manifests) {
    const manifestPath = filePath(manifestFile)
    const manifestRoot = dirname(manifestPath)
    const manifest = await readJsonFile<VsCodeExtensionManifest>(manifestFile, errors)
    const contributions = manifest?.contributes?.themes ?? []

    for (const contribution of contributions) {
      if (!contribution.path) {
        errors.push(`${extensionName(manifest, manifestPath)} has a theme contribution without a path`)
        continue
      }

      const resolvedPath = normalizeRelativePath(`${manifestRoot}/${contribution.path}`)
      const themeFile = byPath.get(resolvedPath) ?? byPath.get(normalizeRelativePath(contribution.path))

      if (!themeFile) {
        errors.push(`${extensionName(manifest, manifestPath)} references missing theme file ${contribution.path}`)
        continue
      }

      const theme = await readJsonFile<Partial<VsCodeTheme>>(themeFile, errors)
      if (!theme) continue

      const source = normalizeVsCodeTheme(theme, contribution)
      if (!source) {
        errors.push(`${filePath(themeFile)} is not a VS Code color theme`)
        continue
      }

      themes.push(createAppTheme(extensionThemeId(manifest, contribution, source, resolvedPath), source))
    }
  }

  if (themes.length === 0) {
    for (const file of fileList.filter(isJsonThemeFile)) {
      if (basename(filePath(file)) === 'package.json') continue

      const theme = await readJsonFile<Partial<VsCodeTheme>>(file, errors)
      if (!theme) continue

      const source = normalizeVsCodeTheme(theme)
      if (source) themes.push(createAppTheme(extensionThemeId(undefined, undefined, source, filePath(file)), source))
    }
  }

  return { themes: uniqueThemes(themes), errors }
}

export function serializeImportedThemes(themes: readonly AppTheme[]): string {
  return JSON.stringify(themes.map(theme => ({ id: theme.id, source: theme.source })))
}

export function deserializeImportedThemes(value?: null | string): AppTheme[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap(item => {
      if (!isRecord(item) || typeof item.id !== 'string' || !isRecord(item.source)) return []
      const source = normalizeVsCodeTheme(item.source as Partial<VsCodeTheme>)
      return source ? [createAppTheme(item.id, source)] : []
    })
  } catch {
    return []
  }
}

function indexThemeFiles(files: readonly VsCodeThemeFile[]): Map<string, VsCodeThemeFile> {
  return new Map(files.map(file => [normalizeRelativePath(filePath(file)), file]))
}

async function readJsonFile<T>(file: VsCodeThemeFile, errors: string[]): Promise<T | undefined> {
  try {
    return JSON.parse(await file.text()) as T
  } catch (error) {
    errors.push(`${filePath(file)} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function normalizeVsCodeTheme(
  theme: Partial<VsCodeTheme>,
  contribution?: VsCodeExtensionThemeContribution
): VsCodeTheme | undefined {
  if (!isRecord(theme.colors)) return undefined

  return {
    name: nonEmptyString(theme.name) ?? nonEmptyString(contribution?.label) ?? 'Imported VS Code Theme',
    type: normalizeThemeType(theme.type ?? contribution?.uiTheme),
    colors: Object.fromEntries(
      Object.entries(theme.colors).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : []))
    ),
    tokenColors: Array.isArray(theme.tokenColors) ? theme.tokenColors : undefined,
    semanticHighlighting: typeof theme.semanticHighlighting === 'boolean' ? theme.semanticHighlighting : undefined,
    semanticTokenColors: isRecord(theme.semanticTokenColors) ? theme.semanticTokenColors : undefined
  }
}

function normalizeThemeType(type: unknown): VsCodeThemeType {
  if (type === 'vs') return 'vs'
  if (type === 'vs-dark') return 'vs-dark'
  if (type === 'hc-black' || type === 'hc') return 'hc'
  if (type === 'hc-light' || type === 'hcLight') return 'hcLight'
  if (type === 'light') return 'light'
  if (type === 'dark') return 'dark'

  return 'dark'
}

function extensionThemeId(
  manifest: VsCodeExtensionManifest | undefined,
  contribution: VsCodeExtensionThemeContribution | undefined,
  source: VsCodeTheme,
  path: string
): string {
  const publisher = nonEmptyString(manifest?.publisher)
  const extension = nonEmptyString(manifest?.name) ?? nonEmptyString(manifest?.displayName)
  const theme = nonEmptyString(contribution?.id) ?? nonEmptyString(contribution?.label) ?? source.name
  return `${THEME_ID_PREFIX}${slug([publisher, extension, theme, path].filter(Boolean).join('-'))}`
}

function extensionName(manifest: VsCodeExtensionManifest | undefined, manifestPath: string): string {
  return nonEmptyString(manifest?.displayName) ?? nonEmptyString(manifest?.name) ?? manifestPath
}

function uniqueThemes(themes: readonly AppTheme[]): AppTheme[] {
  const seen = new Set<string>()
  return themes.filter(theme => {
    if (seen.has(theme.id)) return false
    seen.add(theme.id)
    return true
  })
}

function isJsonThemeFile(file: VsCodeThemeFile): boolean {
  return basename(filePath(file)).toLowerCase().endsWith('.json')
}

function filePath(file: VsCodeThemeFile): string {
  return file.webkitRelativePath || file.name
}

function dirname(path: string): string {
  const normalized = normalizeRelativePath(path)
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

function basename(path: string): string {
  const normalized = normalizeRelativePath(path)
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}

function normalizeRelativePath(path: string): string {
  const parts: string[] = []

  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }

  return parts.join('/')
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}
