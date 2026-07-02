import { expect, test, type Page } from '@playwright/test'

import { installTauriDashboardMock } from '../fixtures/tauri-dashboard-mock'

const routeCases = [
  { hash: '#/main', current: 'BITCH', viewport: { height: 900, width: 1440 } },
  { hash: '#/agent', current: 'AGENT', viewport: { height: 900, width: 1440 } },
  { hash: '#/assets', current: 'ASSETS', viewport: { height: 900, width: 1440 } },
  { hash: '#/calendar', current: 'CALENDAR', viewport: { height: 900, width: 1440 } },
  { hash: '#/cron', current: 'CRON', viewport: { height: 900, width: 1440 } },
  { hash: '#/kanban', current: 'KANBAN', viewport: { height: 900, width: 1440 } },
  { hash: '#/settings', current: 'Open settings', viewport: { height: 844, width: 390 } }
] as const

async function openMockedRoute(page: Page, hash: string): Promise<void> {
  await installTauriDashboardMock(page)
  await page.goto(`/${hash}`)
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
  await expect(page.locator('main').first()).toBeVisible()
}

test.describe('BITCH route-level smoke tests with remote mocks', () => {
  for (const routeCase of routeCases) {
    test(`${routeCase.hash} renders without live Hermes or Beszel services`, async ({ page }) => {
      await page.setViewportSize(routeCase.viewport)
      await openMockedRoute(page, routeCase.hash)

      if (routeCase.current === 'Open settings') {
        await expect(page.getByRole('link', { name: 'Open settings' })).toHaveAttribute('aria-current', 'page')
      } else {
        await expect(page.locator(`[aria-current="page"]`, { hasText: routeCase.current })).toBeVisible()
      }
    })
  }

  test('remote file fixtures include /opt/data and /box paths, not /tmp-only proof', async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 })
    await openMockedRoute(page, '#/assets')

    await expect(page.getByRole('button', { name: 'report.md' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'report.md' }).first().click()
    await expect(page.getByRole('textbox', { name: 'Remote location' })).toHaveValue('/opt/data/projects/report.md')

    await expect(page.getByRole('button', { name: 'render.html' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'render.html' }).first().click()
    await expect(page.getByRole('textbox', { name: 'Remote location' })).toHaveValue(
      '/box/.hermes/cache/canvases/demo/render.html'
    )
    await expect(page.getByText('/tmp/only-proof.txt')).toHaveCount(0)
  })
})
