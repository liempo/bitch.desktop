export type SourceFile = {
  path: string
  source: string
}

type ArchitectureBoundaryRule =
  | 'app-deep-feature-import'
  | 'direct-tauri-core-import'
  | 'monitoring-to-hermes-import'
  | 'hermes-to-monitoring-import'
  | 'shared-platform-to-feature-import'
  | 'domain-purity-violation'
  | 'rust-monitoring-to-hermes-import'
  | 'rust-hermes-to-monitoring-import'
  | 'rust-shared-to-lane-import'
  | 'rust-future-lane-uses-hermes'

export type ArchitectureBoundaryViolation = {
  rule: ArchitectureBoundaryRule
  path: string
  detail: string
  specifier?: string
}

const INTERNAL_FEATURE_SEGMENTS = new Set(['domain', 'application', 'adapters', 'ports', 'view-models'])
const TEST_PATH_PATTERN = /(?:^|[/.])(?:test|spec)\.[^.]+$/

export function findArchitectureBoundaryViolations(
  sourceFiles: readonly SourceFile[]
): ArchitectureBoundaryViolation[] {
  const violations: ArchitectureBoundaryViolation[] = []

  for (const file of sourceFiles) {
    const path = normalizeSourcePath(file.path)
    const source = file.source
    const specifiers = moduleSpecifiers(source).map(specifier => normalizeSpecifier(specifier))
    const isTest = isTestPath(path)

    for (const specifier of specifiers) {
      if (isAppSource(path) && !isTest && isFeatureInternalImport(specifier)) {
        violations.push({
          rule: 'app-deep-feature-import',
          path,
          specifier,
          detail: 'app code must use public feature entrypoints, not feature internals'
        })
      }

      if (isDirectTauriCoreImport(specifier) && !isTest && !isTauriAdapterBoundary(path)) {
        violations.push({
          rule: 'direct-tauri-core-import',
          path,
          specifier,
          detail: 'renderer code must call the platform adapter instead of @tauri-apps/api/core directly'
        })
      }

      if (isMonitoringRendererSource(path) && !isTest && isHermesRendererSpecifier(specifier)) {
        violations.push({
          rule: 'monitoring-to-hermes-import',
          path,
          specifier,
          detail: 'monitoring is a standalone Beszel lane and must not import Hermes modules'
        })
      }

      if (isHermesRendererSource(path) && !isTest && isMonitoringRendererSpecifier(specifier)) {
        violations.push({
          rule: 'hermes-to-monitoring-import',
          path,
          specifier,
          detail: 'Hermes dashboard/runtime code must not import monitoring modules'
        })
      }

      if (isSharedRendererSource(path) && !isTest && isFeatureRendererSpecifier(specifier)) {
        violations.push({
          rule: 'shared-platform-to-feature-import',
          path,
          specifier,
          detail: 'shared/platform modules must not depend on feature lanes'
        })
      }
    }

    if (
      isMonitoringRendererSource(path) &&
      !isTest &&
      /\b(?:HERMES_DASHBOARD|BITCH_DASHBOARD|dashboard_request)\b/.test(source)
    ) {
      violations.push({
        rule: 'monitoring-to-hermes-import',
        path,
        detail: 'monitoring source must not read Hermes dashboard configuration or call dashboard_request'
      })
    }

    if (isHermesRendererSource(path) && !isTest && /\b(?:MONITORING_|Beszel)\b/.test(source)) {
      violations.push({
        rule: 'hermes-to-monitoring-import',
        path,
        detail: 'Hermes source must not read monitoring configuration or reference Beszel'
      })
    }

    if (isDomainSource(path) && !isTest) {
      violations.push(...domainPurityViolations(path, source, specifiers))
    }

    violations.push(...rustBoundaryViolations(path, source, isTest))
  }

  return dedupeViolations(violations)
}

export function formatArchitectureBoundaryViolation(violation: ArchitectureBoundaryViolation): string {
  const specifier = violation.specifier ? ` via ${violation.specifier}` : ''

  return `${violation.path}: ${violation.rule}${specifier} — ${violation.detail}`
}

function normalizeSourcePath(path: string): string {
  let normalized = path.replaceAll('\\', '/')
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  while (normalized.startsWith('../')) normalized = normalized.slice(3)

  return normalized
}

function normalizeSpecifier(specifier: string): string {
  return specifier.replace(/^@\/lib(?=\/|$)/, '$lib')
}

function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const importExportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const viMockPattern = /\bvi\.mock\s*\(\s*['"]([^'"]+)['"]/g

  for (const match of source.matchAll(importExportPattern)) {
    specifiers.push(match[1])
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1])
  }
  for (const match of source.matchAll(viMockPattern)) {
    specifiers.push(match[1])
  }

  return specifiers
}

function stripStringLiterals(source: string): string {
  return source.replace(/`(?:\[\s\S]|(?!`)[^\\])*`|'(?:\.|[^'\\])*'|"(?:\.|[^"\\])*"/g, '')
}

function isTestPath(path: string): boolean {
  return TEST_PATH_PATTERN.test(path)
}

function isAppSource(path: string): boolean {
  return path.startsWith('src/app/')
}

function isMonitoringRendererSource(path: string): boolean {
  return path.startsWith('src/lib/monitoring/')
}

function isHermesRendererSource(path: string): boolean {
  return path.startsWith('src/lib/hermes/')
}

function isSharedRendererSource(path: string): boolean {
  return ['src/lib/errors/', 'src/lib/layout/', 'src/lib/platform/', 'src/lib/storage/', 'src/lib/types/'].some(
    prefix => path.startsWith(prefix)
  )
}

function isDomainSource(path: string): boolean {
  return path.startsWith('src/lib/') && path.includes('/domain/')
}

function isTauriAdapterBoundary(path: string): boolean {
  return path.startsWith('src/lib/platform/') || path.includes('/adapters/')
}

function isDirectTauriCoreImport(specifier: string): boolean {
  return specifier === '@tauri-apps/api/core'
}

function isFeatureInternalImport(specifier: string): boolean {
  const parts = specifier.replace(/^\$lib\//, '').split('/')

  if (parts[0] === 'hermes') return INTERNAL_FEATURE_SEGMENTS.has(parts[2] ?? '')
  if (parts[0] === 'monitoring') return INTERNAL_FEATURE_SEGMENTS.has(parts[1] ?? '')
  if (parts[0] === 'calendar') return INTERNAL_FEATURE_SEGMENTS.has(parts[1] ?? '')

  return false
}

function isHermesRendererSpecifier(specifier: string): boolean {
  return /^\$lib\/(?:api|composer|files|gateway|hermes|messages|session|stores|conversation)(?:\/|$)/.test(specifier)
}

function isMonitoringRendererSpecifier(specifier: string): boolean {
  return /^\$lib\/monitoring(?:\/|$)/.test(specifier)
}

function isFeatureRendererSpecifier(specifier: string): boolean {
  return /^\$lib\/(?:api|calendar|composer|files|gateway|hermes|messages|monitoring|session|stores|conversation)(?:\/|$)/.test(
    specifier
  )
}

function domainPurityViolations(
  path: string,
  source: string,
  specifiers: readonly string[]
): ArchitectureBoundaryViolation[] {
  const violations: ArchitectureBoundaryViolation[] = []

  for (const specifier of specifiers) {
    if (specifier.startsWith('@tauri-apps/')) {
      violations.push({
        rule: 'domain-purity-violation',
        path,
        specifier,
        detail: 'domain modules must not import Tauri APIs'
      })
    }

    if (specifier === 'svelte' || specifier.endsWith('.svelte') || specifier.includes('.svelte?')) {
      violations.push({
        rule: 'domain-purity-violation',
        path,
        specifier,
        detail: 'domain modules must not import Svelte modules or components'
      })
    }
  }

  if (path.endsWith('.svelte')) {
    violations.push({
      rule: 'domain-purity-violation',
      path,
      detail: 'domain modules must be plain TypeScript, not Svelte components'
    })
  }

  const codeOnlySource = stripStringLiterals(source)

  if (
    /\b(?:document|navigator|window)\s*\./.test(codeOnlySource) ||
    /\b(?:localStorage|sessionStorage)\b/.test(codeOnlySource)
  ) {
    violations.push({
      rule: 'domain-purity-violation',
      path,
      detail: 'domain modules must not read browser globals'
    })
  }

  if (/\b(?:EventSource|WebSocket|XMLHttpRequest|fetch)\b\s*\(/.test(codeOnlySource)) {
    violations.push({
      rule: 'domain-purity-violation',
      path,
      detail: 'domain modules must not perform network I/O'
    })
  }

  return violations
}

function rustBoundaryViolations(path: string, source: string, isTest: boolean): ArchitectureBoundaryViolation[] {
  if (!path.startsWith('src-tauri/src/') || isTest) return []

  const violations: ArchitectureBoundaryViolation[] = []

  if (path.startsWith('src-tauri/src/monitoring/') && rustSourceMentionsHermes(source)) {
    violations.push({
      rule: 'rust-monitoring-to-hermes-import',
      path,
      detail: 'Rust monitoring lane must not import Hermes modules or read Hermes dashboard configuration'
    })
  }

  if (path.startsWith('src-tauri/src/hermes/') && rustSourceMentionsMonitoring(source)) {
    violations.push({
      rule: 'rust-hermes-to-monitoring-import',
      path,
      detail: 'Rust Hermes lane must not import monitoring modules or read MONITORING_* configuration'
    })
  }

  if (isRustSharedOrPlatformPath(path) && (rustSourceMentionsHermes(source) || rustSourceMentionsMonitoring(source))) {
    violations.push({
      rule: 'rust-shared-to-lane-import',
      path,
      detail: 'Rust shared/platform modules must not depend on Hermes or monitoring lane details'
    })
  }

  if (isFutureRustLanePath(path) && rustSourceMentionsHermes(source)) {
    violations.push({
      rule: 'rust-future-lane-uses-hermes',
      path,
      detail: 'future backend lanes must not tunnel unrelated systems through Hermes internals'
    })
  }

  return violations
}

function rustSourceMentionsHermes(source: string): boolean {
  return /\b(?:crate::hermes|super::hermes|HERMES_DASHBOARD|BITCH_DASHBOARD|dashboard_request)\b/.test(source)
}

function rustSourceMentionsMonitoring(source: string): boolean {
  return /\b(?:crate::monitoring|super::monitoring|MONITORING_|Beszel|monitoring_request)\b/.test(source)
}

function isRustSharedOrPlatformPath(path: string): boolean {
  return (
    path === 'src-tauri/src/config.rs' ||
    path === 'src-tauri/src/errors.rs' ||
    path === 'src-tauri/src/http.rs' ||
    path.startsWith('src-tauri/src/platform/')
  )
}

function isFutureRustLanePath(path: string): boolean {
  const laneMatch = /^src-tauri\/src\/([^/]+)\//.exec(path)
  if (!laneMatch) return false

  const lane = laneMatch[1]
  if (lane === 'commands') return isFutureRustCommandPath(path)

  return !['hermes', 'monitoring', 'platform'].includes(lane)
}

function isFutureRustCommandPath(path: string): boolean {
  const commandMatch = /^src-tauri\/src\/commands\/([^/.]+)\.rs$/.exec(path)
  if (!commandMatch) return false

  return !['config', 'dashboard', 'gateway', 'mod', 'monitoring', 'platform'].includes(commandMatch[1])
}

function dedupeViolations(violations: readonly ArchitectureBoundaryViolation[]): ArchitectureBoundaryViolation[] {
  const seen = new Set<string>()
  const deduped: ArchitectureBoundaryViolation[] = []

  for (const violation of violations) {
    const key = [violation.rule, violation.path, violation.specifier ?? '', violation.detail].join('\0')
    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(violation)
  }

  return deduped
}
