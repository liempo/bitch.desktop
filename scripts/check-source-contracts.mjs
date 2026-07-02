#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE_CONTRACT_ALLOWLIST = [
  {
    path: 'src/lib/tests/support/architecture-boundaries.test.ts',
    disposition: 'KEEP',
    owner: 'architecture boundary support',
    rationale:
      'Canonical forbidden-import and lane-boundary tripwire; runtime tests would not catch source-level dependency leaks.'
  },
  {
    path: 'src/lib/tests/support/module-contracts.test.ts',
    disposition: 'KEEP',
    owner: 'module contract support',
    rationale: 'Absence of obsolete top-level Hermes compatibility paths and store shims is a source tree contract.'
  },
  {
    path: 'src/lib/tests/support/rust-bridge-lanes.test.ts',
    disposition: 'KEEP',
    owner: 'Rust bridge lanes',
    rationale: 'Native bridge split and cross-lane leakage are source-structure contracts.'
  },
  {
    path: 'src/lib/tests/monitoring/lane-boundary.test.ts',
    disposition: 'KEEP',
    owner: 'monitoring lane',
    rationale: 'Protects the standalone Beszel lane from Hermes/dashboard imports.'
  },
  {
    path: 'src/lib/tests/hermes/files/index.test.ts',
    disposition: 'KEEP',
    owner: 'Hermes files lane',
    rationale: 'Public-entrypoint migration and remote-only file consumer imports are architecture tripwires.'
  },
  {
    path: 'src/app/tests/app-shell-code-splitting.test.ts',
    disposition: 'KEEP',
    owner: 'app shell / bundle',
    rationale:
      'Dynamic route imports, chunk grouping, and deferred Threlte splash loading are explicit bundle/lazy-loading contracts.'
  },
  {
    path: 'src/app/tests/startup-branding.test.ts',
    disposition: 'KEEP',
    owner: 'startup branding / native packaging',
    rationale: 'Pre-bundle splash markup, desktop naming, and generated icon list are migration/packaging canaries.'
  },
  {
    path: 'src/app/tests/message-stream-lifecycle.test.ts',
    disposition: 'KEEP',
    owner: 'app shell lifecycle',
    rationale: 'The gateway stream subscription location is a route-lifecycle source placement contract.'
  },
  {
    path: 'src/app/tests/navigation/theme-picker.test.ts',
    disposition: 'KEEP',
    owner: 'theme shell / portal',
    rationale:
      'Shell and portal theme attributes plus centralized CSS tokens are source-level theme propagation canaries.'
  },
  {
    path: 'src/app/tests/settings/SettingsPage.test.ts',
    disposition: 'KEEP',
    owner: 'Settings route / migration',
    rationale: 'Lazy route/navbar entries and removed source-updater strings are route/migration canaries.'
  },
  {
    path: 'src/lib/tests/support/install-script.test.ts',
    disposition: 'KEEP',
    owner: 'installer / platform',
    rationale: 'File reads inspect fixture inputs and generated installer output; this is installer behavior coverage.'
  },
  {
    path: 'src/lib/tests/support/testing-foundation.test.ts',
    disposition: 'KEEP',
    owner: 'testing foundation / CI',
    rationale: 'Keeps the documented pyramid, harness files, CI commands, and allowlist policy encoded in CI.'
  },
  {
    path: 'src/app/tests/ui/svg-icons.test.ts',
    disposition: 'KEEP',
    owner: 'shared icon migration',
    rationale: 'No-icon-font/shared-Icon migration canary; rendered Icon accessibility is component-tested.'
  },
  {
    path: 'src/app/tests/agent/preview/AgentPreviewSidebar.test.ts',
    disposition: 'KEEP',
    owner: 'Agent preview source shell',
    rationale:
      'Remaining source checks guard preview shell placement, Markdown hook wiring, and public-file-server regressions.'
  },
  {
    path: 'src/app/tests/main/MainPage.test.ts',
    disposition: 'REPLACE_WITH_UI',
    owner: 'MAIN route',
    rationale:
      'Route/layout behavior should move to Playwright coverage; only smaller product-guarantee tripwires should remain.'
  },
  {
    path: 'src/app/tests/agent/AgentShell.test.ts',
    disposition: 'REPLACE_WITH_COMPONENT',
    owner: 'Agent page components',
    rationale:
      'Render separators, resize handles, mobile session dialog, widths, and responsive props instead of checking strings.'
  },
  {
    path: 'src/app/tests/assets/AssetsPage.test.ts',
    disposition: 'REPLACE_WITH_UI',
    owner: 'Assets route',
    rationale:
      'Filesystem actions and previews should be route/component behavior tests against dashboard filesystem mocks.'
  },
  {
    path: 'src/app/tests/calendar/CalendarPage.test.ts',
    disposition: 'REPLACE_WITH_UNIT',
    owner: 'Calendar domain/application',
    rationale: 'Virtual grid and event-mapping behavior belongs in executable unit/component coverage.'
  },
  {
    path: 'src/app/tests/cron/CronPage.test.ts',
    disposition: 'REPLACE_WITH_UI',
    owner: 'Cron route',
    rationale: 'Job list, details, run output, and create/edit flows should be exercised with mocked Hermes Cron APIs.'
  },
  {
    path: 'src/app/tests/kanban-route.test.ts',
    disposition: 'REPLACE_WITH_UI',
    owner: 'Kanban route',
    rationale: 'Lanes, filters, detail pane, profile context, and drag/drop affordances should be behavior tests.'
  },
  {
    path: 'src/lib/tests/hermes/files/domain/preview.test.ts',
    disposition: 'REPLACE_WITH_COMPONENT',
    owner: 'Hermes files domain + Assets UI',
    rationale: 'Keep classifier unit coverage; move the AssetsPage source block to rendered component/route coverage.'
  }
]

const VALID_DISPOSITIONS = new Set(['KEEP', 'REPLACE_WITH_UNIT', 'REPLACE_WITH_COMPONENT', 'REPLACE_WITH_UI', 'DELETE'])
const TEST_ROOTS = ['src/app/tests', 'src/lib/tests']

function toPosix(path) {
  return path.split(sep).join('/')
}

function stripCommentsAndStrings(source) {
  let output = ''
  let state = 'code'
  let quote = ''

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]
    const next = source[index + 1]

    if (state === 'line-comment') {
      if (current === '\n') {
        state = 'code'
        output += '\n'
      } else {
        output += ' '
      }
      continue
    }

    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        output += '  '
        index += 1
        state = 'code'
      } else {
        output += current === '\n' ? '\n' : ' '
      }
      continue
    }

    if (state === 'string') {
      if (current === '\\') {
        output += ' '
        if (next) {
          output += next === '\n' ? '\n' : ' '
          index += 1
        }
        continue
      }
      if (current === quote) {
        state = 'code'
        quote = ''
      }
      output += current === '\n' ? '\n' : ' '
      continue
    }

    if (current === '/' && next === '/') {
      output += '  '
      index += 1
      state = 'line-comment'
      continue
    }
    if (current === '/' && next === '*') {
      output += '  '
      index += 1
      state = 'block-comment'
      continue
    }
    if (current === "'" || current === '"' || current === '`') {
      output += ' '
      state = 'string'
      quote = current
      continue
    }

    output += current
  }

  return output
}

export function findSourceContractMarkers(source) {
  const markers = []
  const stripped = stripCommentsAndStrings(source)

  if (/^\s*import\s+[^\n]*\sfrom\s+['"][^'"\n]+\?raw['"]/m.test(source)) {
    markers.push('?raw')
  }
  if (/\bquery\s*:\s*['"]\?raw['"]/.test(source)) {
    markers.push("query: '?raw'")
  }
  if (/\breadFileSync\s*\(/.test(stripped)) {
    markers.push('readFileSync(')
  }
  if (/\breadFile\s*\(/.test(stripped)) {
    markers.push('readFile(')
  }

  return markers
}

function walkFiles(path) {
  if (!existsSync(path)) {
    return []
  }

  const entries = readdirSync(path, { withFileTypes: true })
  return entries.flatMap(entry => {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) {
      return walkFiles(entryPath)
    }
    if (!entry.isFile()) {
      return []
    }
    return [entryPath]
  })
}

function isTestSource(path) {
  return /(?:\.test\.ts|\.spec\.ts|\.ui\.ts)$/.test(path) && !path.endsWith('.d.ts')
}

export function discoverSourceContractFiles(root = process.cwd()) {
  return TEST_ROOTS.flatMap(testRoot => walkFiles(join(root, testRoot)))
    .filter(isTestSource)
    .map(filePath => {
      const source = readFileSync(filePath, 'utf8')
      return {
        path: toPosix(relative(root, filePath)),
        markers: findSourceContractMarkers(source)
      }
    })
    .filter(entry => entry.markers.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function evaluateSourceContractInventory({ allowlist, discovered, docsText }) {
  const allowlistByPath = new Map(allowlist.map(entry => [entry.path, entry]))
  const discoveredByPath = new Map(discovered.map(entry => [entry.path, entry]))
  const unlisted = discovered.filter(entry => !allowlistByPath.has(entry.path)).map(entry => entry.path)
  const staleAllowlist = allowlist.filter(entry => !discoveredByPath.has(entry.path)).map(entry => entry.path)
  const undocumented = allowlist.filter(entry => !docsText.includes(entry.path)).map(entry => entry.path)
  const invalidAllowlistEntries = allowlist
    .filter(entry => !VALID_DISPOSITIONS.has(entry.disposition) || !entry.owner?.trim() || !entry.rationale?.trim())
    .map(entry => entry.path)

  const discoveredAllowlist = discovered.map(entry => allowlistByPath.get(entry.path)).filter(Boolean)
  const keep = discoveredAllowlist.filter(entry => entry.disposition === 'KEEP').length
  const migration = discoveredAllowlist.length - keep

  return {
    ok:
      unlisted.length === 0 &&
      staleAllowlist.length === 0 &&
      undocumented.length === 0 &&
      invalidAllowlistEntries.length === 0,
    counts: {
      discovered: discovered.length,
      keep,
      migration
    },
    unlisted,
    staleAllowlist,
    undocumented,
    invalidAllowlistEntries
  }
}

function formatList(title, values) {
  if (values.length === 0) {
    return ''
  }
  return `${title}:\n${values.map(value => `  - ${value}`).join('\n')}`
}

function runCli() {
  const root = process.cwd()
  const docsPath = join(root, 'docs/testing.md')
  const docsText = existsSync(docsPath) ? readFileSync(docsPath, 'utf8') : ''
  const discovered = discoverSourceContractFiles(root)
  const result = evaluateSourceContractInventory({
    allowlist: SOURCE_CONTRACT_ALLOWLIST,
    discovered,
    docsText
  })

  console.log(
    `Source-contract inventory: ${result.counts.discovered} file(s) ` +
      `(${result.counts.keep} KEEP, ${result.counts.migration} migration disposition)`
  )
  for (const entry of discovered) {
    const allowlistEntry = SOURCE_CONTRACT_ALLOWLIST.find(candidate => candidate.path === entry.path)
    console.log(`- ${entry.path} [${allowlistEntry?.disposition ?? 'UNLISTED'}] markers=${entry.markers.join(', ')}`)
  }

  if (!result.ok) {
    const sections = [
      formatList('Unlisted source-contract tests', result.unlisted),
      formatList('Allowlist entries with no matching source-contract test', result.staleAllowlist),
      formatList('Allowlist entries missing from docs/testing.md', result.undocumented),
      formatList('Allowlist entries missing owner/rationale/disposition', result.invalidAllowlistEntries)
    ].filter(Boolean)

    console.error(
      `\nSource-contract guard failed. Raw-source/file-text tests must be documented and allowlisted.\n${sections.join('\n\n')}`
    )
    process.exitCode = 1
  }
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? fileURLToPath(new URL(process.argv[1], 'file:')) : ''
if (currentFile === invokedFile) {
  runCli()
}
