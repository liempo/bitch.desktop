import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  expect: {
    timeout: 10_000
  },
  fullyParallel: true,
  outputDir: 'test-results/playwright',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  testDir: '.',
  testMatch: 'src/app/tests/**/*.ui.ts',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run frontend:dev',
    reuseExistingServer: !process.env.CI,
    stderr: 'pipe',
    stdout: 'pipe',
    timeout: 120_000,
    url: 'http://127.0.0.1:5173'
  }
})
