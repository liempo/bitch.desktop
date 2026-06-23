/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

import {
  findArchitectureBoundaryViolations,
  formatArchitectureBoundaryViolation,
  type SourceFile
} from './architecture-boundaries'

function sourceFilesFromGlob(globbed: Record<string, string>, sourceRoot: string): SourceFile[] {
  return Object.entries(globbed).map(([path, source]) => {
    const relativePath = path
      .replaceAll('\\', '/')
      .replace(/^\.\//, '')
      .replace(/^(?:\.\.\/)+/, '')

    return {
      path: [sourceRoot, relativePath].filter(Boolean).join('/'),
      source
    }
  })
}

const rendererSources = [
  ...sourceFilesFromGlob(
    import.meta.glob('../../**/*.{ts,svelte}', { eager: true, import: 'default', query: '?raw' }),
    'src/lib'
  ),
  ...sourceFilesFromGlob(
    import.meta.glob('../../../app/**/*.{ts,svelte}', { eager: true, import: 'default', query: '?raw' }),
    'src'
  )
]

const rustSources = sourceFilesFromGlob(
  import.meta.glob('../../../../src-tauri/src/**/*.rs', { eager: true, import: 'default', query: '?raw' }),
  ''
)

describe('architecture boundary rules', () => {
  it('flags intentional bad imports before they can colonize the codebase', () => {
    const violations = findArchitectureBoundaryViolations([
      {
        path: 'src/app/main/BadPanel.svelte',
        source: `
          <script lang="ts">
            import { invoke } from '@tauri-apps/api/core'
            import { normalizeMonitoringMetrics } from '$lib/monitoring/domain/normalize'
          </script>
        `
      },
      {
        path: 'src/lib/monitoring/adapters/bad-monitoring.ts',
        source: `import { dashboardRequest } from '$lib/hermes/dashboard'`
      },
      {
        path: 'src/lib/platform/tauri.ts',
        source: `import { fetchMonitoringMetrics } from '$lib/monitoring'`
      },
      {
        path: 'src/lib/hermes/files/domain/bad-domain.ts',
        source: `
          import type { SvelteComponent } from 'svelte'
          import { invoke } from '@tauri-apps/api/core'
          window.fetch('/api/leak')
        `
      },
      {
        path: 'src-tauri/src/monitoring/bad.rs',
        source: `use crate::hermes::dashboard_http; const URL: &str = "HERMES_DASHBOARD_URL";`
      },
      {
        path: 'src-tauri/src/hermes/bad.rs',
        source: `use crate::monitoring::beszel; const URL: &str = "MONITORING_URL";`
      }
    ])

    expect(violations.map(violation => violation.rule)).toEqual(
      expect.arrayContaining([
        'app-deep-feature-import',
        'direct-tauri-core-import',
        'monitoring-to-hermes-import',
        'shared-platform-to-feature-import',
        'domain-purity-violation',
        'rust-monitoring-to-hermes-import',
        'rust-hermes-to-monitoring-import'
      ])
    )
  })

  it('keeps future backend lanes isolated instead of tunneling them through Hermes internals', () => {
    const cleanFutureLane = findArchitectureBoundaryViolations([
      {
        path: 'src-tauri/src/calendar/caldav.rs',
        source: `use crate::http::build_http_client; pub fn list_events() {}`
      },
      {
        path: 'src-tauri/src/commands/calendar.rs',
        source: `use crate::calendar::caldav; pub async fn list_calendar_events() {}`
      }
    ])

    const tunneledFutureLane = findArchitectureBoundaryViolations([
      {
        path: 'src-tauri/src/calendar/caldav.rs',
        source: `use crate::hermes::dashboard_http; pub fn list_events() { dashboard_request(); }`
      },
      {
        path: 'src-tauri/src/commands/calendar.rs',
        source: `use crate::hermes::files; pub async fn list_calendar_events() {}`
      }
    ])

    expect(cleanFutureLane).toEqual([])
    expect(tunneledFutureLane.map(violation => violation.rule)).toContain('rust-future-lane-uses-hermes')
  })

  it('accepts the current renderer and Rust source tree', () => {
    const violations = findArchitectureBoundaryViolations([...rendererSources, ...rustSources])

    expect(violations.map(formatArchitectureBoundaryViolation)).toEqual([])
  })
})
