import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const installScript = path.join(repoRoot, 'scripts', 'install.mjs')
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

describe('app install script', () => {
  it('exposes the simple npm run install command without making dependency install recurse', () => {
    expect(packageJson.scripts.install).toBe('node scripts/install.mjs')

    const output = execFileSync(process.execPath, [installScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, npm_command: 'install' }
    })

    expect(output).toContain('skipping app install during npm install lifecycle')
  })

  it('migrates a legacy .env and copies a built bundle into ~/Applications', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitch-install-'))
    const homeDir = path.join(tempDir, 'home')
    const envPath = path.join(tempDir, '.env')
    const bundlePath = path.join(tempDir, 'BITCH.app')

    try {
      fs.mkdirSync(path.join(bundlePath, 'Contents'), { recursive: true })
      fs.writeFileSync(path.join(bundlePath, 'Contents', 'Info.plist'), '<plist></plist>')
      fs.writeFileSync(
        envPath,
        [
          'HERMES_DASHBOARD_URL=http://127.0.0.1:9119',
          'HERMES_DASHBOARD_SESSION_TOKEN=dashboard-secret-token',
          'HERMES_DASHBOARD_USERNAME=operator',
          'HERMES_DASHBOARD_PASSWORD=dashboard-secret-password',
          'MONITORING_URL=http://homestation:8090',
          'MONITORING_SYSTEM_ID=system_1',
          'MONITORING_AUTH_TOKEN=monitor-secret-token',
          'CALDAV_URL=https://calendar.example.test/dav/user/',
          'CALDAV_USERNAME=calendar-user',
          'CALDAV_PASSWORD=calendar-secret-password',
          'CALDAV_SYNC_INTERVAL=1800',
          'EXTRA_BITCH_FLAG=extra'
        ].join('\n')
      )

      const output = execFileSync(
        process.execPath,
        [installScript, '--skip-build', '--home', homeDir, '--env', envPath, '--bundle-path', bundlePath],
        { cwd: repoRoot, encoding: 'utf8' }
      )
      const migratedConfig = fs.readFileSync(path.join(homeDir, '.bitch', 'config.yaml'), 'utf8')

      expect(fs.existsSync(path.join(homeDir, 'Applications', 'BITCH.app', 'Contents', 'Info.plist'))).toBe(true)
      expect(migratedConfig).toContain('connection:')
      expect(migratedConfig).toContain('authMode: token')
      expect(migratedConfig).toContain('monitoring:')
      expect(migratedConfig).toContain('calendar:')
      expect(migratedConfig).toContain('syncIntervalSeconds: 1800')
      expect(migratedConfig).toContain('EXTRA_BITCH_FLAG: extra')
      expect(output).toContain(
        'migrated config sections/keys: connection, hermes, monitoring, calendar, EXTRA_BITCH_FLAG'
      )
      expect(output).not.toContain('dashboard-secret-token')
      expect(output).not.toContain('monitor-secret-token')
      expect(output).not.toContain('calendar-secret-password')
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true })
    }
  })
})
