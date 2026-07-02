import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readText(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

function readPackageJson(): {
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
  knip?: { ignore?: string[] }
} {
  return JSON.parse(readText('package.json'))
}

describe('testing foundation contract', () => {
  it('documents the BITCH test pyramid and remote-only mocking policy', () => {
    expect(existsSync(join(root, 'docs/testing.md'))).toBe(true)

    const testingDoc = readText('docs/testing.md')
    expect(testingDoc).toContain('# Testing')
    expect(testingDoc).toContain('Test pyramid')
    expect(testingDoc).toContain('Pure unit and source-contract tests')
    expect(testingDoc).toContain('Svelte component DOM tests')
    expect(testingDoc).toContain('Route-level UI tests')
    expect(testingDoc).toContain('Remote-only mocks')
    expect(testingDoc).toContain('Tauri commands')
    expect(testingDoc).toContain('Hermes dashboard REST')
    expect(testingDoc).toContain('WebSocket events')
    expect(testingDoc).toContain('Beszel monitoring')
    expect(testingDoc).toContain('remote filesystem/media')
    expect(testingDoc).toContain('notifications')
    expect(testingDoc).toContain('Fixture ownership')
    expect(testingDoc).toContain('Route-level UI coverage matrix')
    expect(testingDoc).toContain('route-interactions.ui.ts')
    expect(testingDoc).toContain('MAIN')
    expect(testingDoc).toContain('AGENT')
    expect(testingDoc).toContain('ASSETS')
    expect(testingDoc).toContain('CALENDAR')
    expect(testingDoc).toContain('CRON')
    expect(testingDoc).toContain('KANBAN')
    expect(testingDoc).toContain('SETTINGS')
    expect(testingDoc).toContain('/opt/data')
    expect(testingDoc).toContain('/box')
    expect(testingDoc).toContain('Never add Dufs')
    expect(testingDoc).toContain('`VITE_BOX_BASE_URL`')
    expect(testingDoc).toContain('Behavior-first testing')
    expect(testingDoc).toContain('Source-contract allowlist')
    expect(testingDoc).toContain('Allowed source-contract categories')
    expect(testingDoc).toContain('Current source-contract inventory')
    expect(testingDoc).toContain('REPLACE_WITH_UNIT')
    expect(testingDoc).toContain('REPLACE_WITH_COMPONENT')
    expect(testingDoc).toContain('REPLACE_WITH_UI')
    expect(testingDoc).toContain('Raw-source checks are CI-allowlisted architecture tripwires only')
    expect(testingDoc).toContain('npm run test:source-contracts')
  })

  it('exposes routine scripts and direct dependencies for each test layer', () => {
    const packageJson = readPackageJson()

    expect(packageJson.scripts?.['test:unit']).toBe('vitest run --config vitest.unit.config.ts')
    expect(packageJson.scripts?.['test:component']).toBe('vitest run --config vitest.component.config.ts')
    expect(packageJson.scripts?.['test:ui']).toBe('playwright test --config playwright.config.ts')
    expect(packageJson.scripts?.['test:all']).toBe('npm run test:unit && npm run test:component && npm run test:ui')
    expect(packageJson.scripts?.['test:source-contracts']).toBe('node scripts/check-source-contracts.mjs')
    expect(packageJson.scripts?.['validate:full']).toBe(
      'npm run fmt:check && npm run type-check && npm run lint && npm run test:source-contracts && npm test && npm run test:component && npm run test:ui && npm run frontend:build && npm audit --audit-level=moderate && npx --yes knip --reporter json && git diff --check'
    )

    expect(packageJson.devDependencies).toHaveProperty('@testing-library/svelte')
    expect(packageJson.devDependencies).toHaveProperty('@testing-library/user-event')
    expect(packageJson.devDependencies).toHaveProperty('@testing-library/jest-dom')
    expect(packageJson.devDependencies).toHaveProperty('jsdom')
    expect(packageJson.devDependencies).toHaveProperty('@playwright/test')
  })

  it('keeps Vitest and Playwright harness files explicit and documented', () => {
    const packageJson = readPackageJson()
    const docsReadme = readText('docs/README.md')
    const rootReadme = readText('README.md')
    const agentsGuide = readText('AGENTS.md')
    const gitignore = readText('.gitignore')

    expect(existsSync(join(root, 'vitest.unit.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'vitest.component.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'playwright.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/lib/tests/support/component-dom-setup.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/app/tests/fixtures/tauri-dashboard-mock.ts'))).toBe(true)
    expect(existsSync(join(root, 'scripts/check-source-contracts.mjs'))).toBe(true)
    expect(existsSync(join(root, '.github/PULL_REQUEST_TEMPLATE.md'))).toBe(true)

    expect(readText('vitest.component.config.ts')).toContain("environment: 'jsdom'")
    expect(readText('vitest.component.config.ts')).toContain('component-dom-setup.ts')
    expect(readText('playwright.config.ts')).toContain('src/app/tests/**/*.ui.ts')
    expect(readText('playwright.config.ts')).toContain('npm run frontend:dev')
    expect(readText('playwright.config.ts')).toContain('test-results/playwright')
    expect(packageJson.knip?.ignore ?? []).toContain('test-results/**')
    expect(packageJson.knip?.ignore ?? []).toContain('playwright-report/**')
    expect(gitignore).toContain('test-results/')
    expect(gitignore).toContain('playwright-report/')

    expect(docsReadme).toContain('[`testing.md`](testing.md)')
    expect(rootReadme).toContain('npm run test:all')
    expect(rootReadme).toContain('npm run validate:full')
    expect(agentsGuide).toContain('docs/testing.md')
    expect(agentsGuide).toContain('npm run test:all')
    expect(agentsGuide).toContain('Behavior-first tests')
  })

  it('keeps the CI validation workflow aligned with the documented test foundation', () => {
    const workflowPath = '.github/workflows/validation.yml'

    expect(existsSync(join(root, workflowPath))).toBe(true)

    const workflow = readText(workflowPath)
    expect(workflow).toContain('npm ci --ignore-scripts')
    expect(workflow).toContain('npm run fmt:check')
    expect(workflow).toContain('npm run type-check')
    expect(workflow).toContain('npm run lint')
    expect(workflow).toContain('npm test')
    expect(workflow).toContain('npm run test:source-contracts')
    expect(workflow).toContain('npm run test:component')
    expect(workflow).toContain('npm run test:ui')
    expect(workflow).toContain('npm run frontend:build')
    expect(workflow).toContain('npm audit --audit-level=moderate')
    expect(workflow).toContain('npx --yes knip --reporter json')
    expect(workflow).toContain('git diff --check')
  })
})
