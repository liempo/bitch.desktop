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
    expect(testingDoc).toContain('/opt/data')
    expect(testingDoc).toContain('/box')
    expect(testingDoc).toContain('Never add Dufs')
    expect(testingDoc).toContain('`VITE_BOX_BASE_URL`')
  })

  it('exposes routine scripts and direct dependencies for each test layer', () => {
    const packageJson = readPackageJson()

    expect(packageJson.scripts?.['test:unit']).toBe('vitest run --config vitest.unit.config.ts')
    expect(packageJson.scripts?.['test:component']).toBe('vitest run --config vitest.component.config.ts')
    expect(packageJson.scripts?.['test:ui']).toBe('playwright test --config playwright.config.ts')
    expect(packageJson.scripts?.['test:all']).toBe('npm run test:unit && npm run test:component && npm run test:ui')

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

    expect(existsSync(join(root, 'vitest.unit.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'vitest.component.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'playwright.config.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/lib/tests/support/component-dom-setup.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/app/tests/fixtures/tauri-dashboard-mock.ts'))).toBe(true)

    expect(readText('vitest.component.config.ts')).toContain("environment: 'jsdom'")
    expect(readText('vitest.component.config.ts')).toContain('component-dom-setup.ts')
    expect(readText('playwright.config.ts')).toContain('src/app/tests/**/*.ui.ts')
    expect(readText('playwright.config.ts')).toContain('npm run frontend:dev')
    expect(readText('playwright.config.ts')).toContain('test-results/playwright')
    expect(packageJson.knip?.ignore ?? []).toContain('test-results/**')

    expect(docsReadme).toContain('[`testing.md`](testing.md)')
    expect(rootReadme).toContain('npm run test:all')
    expect(agentsGuide).toContain('docs/testing.md')
    expect(agentsGuide).toContain('npm run test:all')
  })
})
