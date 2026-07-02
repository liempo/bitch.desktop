import { expect, test, type Page } from '@playwright/test'

import { installTauriDashboardMock } from '../fixtures/tauri-dashboard-mock'

type MockScenario = 'cron-error' | 'cron-loading' | 'default'

async function openMockedRoute(page: Page, hash: string, scenario: MockScenario = 'default'): Promise<void> {
  await page.addInitScript(value => {
    ;(window as Window & { __BITCH_TEST_SCENARIO__?: string }).__BITCH_TEST_SCENARIO__ = value
  }, scenario)
  await installTauriDashboardMock(page)
  await page.goto(`/${hash}`)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await expect(page.locator('main')).toBeVisible()
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function monthWithOffset(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

test.describe('BITCH route interactions with mocked remote services', () => {
  test('mobile navigation popover changes top-level routes without a live gateway', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openMockedRoute(page, '#/main')

    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await expect(page.getByText('navigation')).toBeVisible()

    await page.getByRole('link', { name: 'ASSETS' }).click()
    await expect(page).toHaveURL(/#\/assets$/)
    await expect(page.getByRole('region', { name: 'Remote assets browser' })).toBeVisible()
  })

  test('mobile AGENT session dialog lists and selects remote sessions', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openMockedRoute(page, '#/agent')

    await page
      .getByRole('button', { name: 'SESSION' })
      .filter({ hasText: /^SESSION$/ })
      .first()
      .press('Enter')
    await expect(page.getByRole('dialog', { name: 'Select AGENT Session' })).toBeVisible()
    await expect(page.getByRole('option', { name: /New session/ })).toBeVisible()

    await page.getByRole('option', { name: 'Select Route smoke session' }).click()
    await expect(page).toHaveURL(/#\/agent\/mock-session$/)
    await expect(page.getByRole('region', { name: 'Message conversation' })).toContainText(
      'Mocked stored conversation rendered from the dashboard session API.'
    )
  })

  test('Assets previews authenticated /opt/data text files and /box canvas media paths', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 })
    await openMockedRoute(page, '#/assets')

    await page.getByRole('button', { name: 'report.md' }).first().click()
    await expect(page.getByRole('textbox', { name: 'Remote location' })).toHaveValue('/opt/data/projects/report.md')
    await expect(page.getByText('mock remote file preview for /opt/data/projects/report.md')).toBeVisible()

    await page.getByRole('button', { name: 'render.html' }).first().click()
    await expect(page.getByRole('textbox', { name: 'Remote location' })).toHaveValue(
      '/box/.hermes/cache/canvases/demo/render.html'
    )
    await expect(page.frameLocator('iframe[title="render.html"]').locator('body')).toContainText('Mock canvas preview')
    await expect(page.getByText('/tmp/only-proof.txt')).toHaveCount(0)
  })

  test('Calendar supports month navigation, today reset, and event detail inspection', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 })
    await openMockedRoute(page, '#/calendar')

    const today = new Date()
    await expect(page.getByText(monthLabel(today)).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show details for Calendar E2E Standup' }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.getByText(monthLabel(monthWithOffset(today, 1))).first()).toBeVisible()

    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page.getByText(monthLabel(today)).first()).toBeVisible()

    await page.getByRole('button', { name: 'Show details for Calendar E2E Standup' }).first().click()
    await expect(page.getByRole('article', { name: 'Details for Calendar E2E Standup' })).toBeVisible()
    await expect(page.getByText('Mock Board Room')).toBeVisible()
    await expect(page.getByRole('link', { name: 'https://calendar.example/e2e' })).toBeVisible()
  })

  test('Kanban collapses lanes and opens card details with mocked board data', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 })
    await openMockedRoute(page, '#/kanban')

    const readyCard = page.getByRole('button', { name: 'Show details for Route UI ready card' })
    await expect(readyCard).toBeVisible()

    const readyHeader = page.getByRole('button', { name: /Ready.*drop target.*1/ })
    await readyHeader.click()
    await expect(readyCard).toBeHidden()
    await readyHeader.click()
    await expect(readyCard).toBeVisible()

    await readyCard.click()
    await expect(page.getByRole('region', { name: 'Kanban card description' })).toContainText(
      'Mocked route-level Kanban detail body.'
    )
    await expect(page.getByRole('region', { name: 'Kanban card metadata' })).toContainText('t_route_ready')
  })

  test('Cron shows loading, job, and failed-backend states from remote mocks', async ({ browser }) => {
    const loadingPage = await browser.newPage({ viewport: { height: 900, width: 1440 } })
    await openMockedRoute(loadingPage, '#/cron', 'cron-loading')
    await expect(loadingPage.getByRole('status', { name: 'Loading cron jobs' })).toBeVisible()
    await expect(loadingPage.getByRole('button', { name: 'Show details for Mock nightly route test' })).toBeVisible()
    await expect(loadingPage.getByText('Run failure: mock cron explosion')).toBeVisible()
    await loadingPage.close()

    const errorPage = await browser.newPage({ viewport: { height: 900, width: 1440 } })
    await openMockedRoute(errorPage, '#/cron', 'cron-error')
    await expect(errorPage.getByRole('alert')).toContainText('Cron jobs unavailable: Mock cron backend offline')
    await errorPage.close()
  })

  test('Settings changes theme and opens the Marketplace theme picker dialog on mobile', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openMockedRoute(page, '#/settings')

    await page.getByLabel('Theme').selectOption({ label: 'Terminal Green' })
    await expect(page.locator('[data-theme="terminal-green"]')).toBeVisible()

    await page.getByRole('button', { name: 'Open VS Code theme picker' }).click()
    await expect(page.getByRole('dialog', { name: 'VS Code Theme Picker' })).toBeVisible()
    await expect(page.getByText('VS Code Marketplace themes')).toBeVisible()
  })
})
