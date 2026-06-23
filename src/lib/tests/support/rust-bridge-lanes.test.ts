import { describe, expect, it } from 'vitest'

import commandsConfigSource from '../../../../src-tauri/src/commands/config.rs?raw'
import commandsDashboardSource from '../../../../src-tauri/src/commands/dashboard.rs?raw'
import commandsGatewaySource from '../../../../src-tauri/src/commands/gateway.rs?raw'
import commandsModSource from '../../../../src-tauri/src/commands/mod.rs?raw'
import commandsMonitoringSource from '../../../../src-tauri/src/commands/monitoring.rs?raw'
import commandsPlatformSource from '../../../../src-tauri/src/commands/platform.rs?raw'
import configSource from '../../../../src-tauri/src/config.rs?raw'
import errorsSource from '../../../../src-tauri/src/errors.rs?raw'
import hermesAuthSource from '../../../../src-tauri/src/hermes/auth.rs?raw'
import hermesConfigSource from '../../../../src-tauri/src/hermes/config.rs?raw'
import hermesDashboardHttpSource from '../../../../src-tauri/src/hermes/dashboard_http.rs?raw'
import hermesFilesSource from '../../../../src-tauri/src/hermes/files.rs?raw'
import hermesGatewayWsSource from '../../../../src-tauri/src/hermes/gateway_ws.rs?raw'
import hermesModSource from '../../../../src-tauri/src/hermes/mod.rs?raw'
import httpSource from '../../../../src-tauri/src/http.rs?raw'
import libSource from '../../../../src-tauri/src/lib.rs?raw'
import monitoringAuthSource from '../../../../src-tauri/src/monitoring/auth.rs?raw'
import monitoringBeszelSource from '../../../../src-tauri/src/monitoring/beszel.rs?raw'
import monitoringConfigSource from '../../../../src-tauri/src/monitoring/config.rs?raw'
import monitoringModSource from '../../../../src-tauri/src/monitoring/mod.rs?raw'
import platformExternalUrlSource from '../../../../src-tauri/src/platform/external_url.rs?raw'
import platformModSource from '../../../../src-tauri/src/platform/mod.rs?raw'
import platformWindowSource from '../../../../src-tauri/src/platform/window.rs?raw'

const rustLaneSources = {
  'config.rs': configSource,
  'errors.rs': errorsSource,
  'http.rs': httpSource,
  'platform/mod.rs': platformModSource,
  'platform/window.rs': platformWindowSource,
  'platform/external_url.rs': platformExternalUrlSource,
  'hermes/mod.rs': hermesModSource,
  'hermes/config.rs': hermesConfigSource,
  'hermes/auth.rs': hermesAuthSource,
  'hermes/dashboard_http.rs': hermesDashboardHttpSource,
  'hermes/files.rs': hermesFilesSource,
  'hermes/gateway_ws.rs': hermesGatewayWsSource,
  'monitoring/mod.rs': monitoringModSource,
  'monitoring/config.rs': monitoringConfigSource,
  'monitoring/auth.rs': monitoringAuthSource,
  'monitoring/beszel.rs': monitoringBeszelSource,
  'commands/mod.rs': commandsModSource,
  'commands/config.rs': commandsConfigSource,
  'commands/dashboard.rs': commandsDashboardSource,
  'commands/gateway.rs': commandsGatewaySource,
  'commands/monitoring.rs': commandsMonitoringSource,
  'commands/platform.rs': commandsPlatformSource
}

describe('Rust bridge backend lanes', () => {
  it('splits the Tauri bridge into explicit backend lane modules', () => {
    expect(Object.keys(rustLaneSources)).toEqual([
      'config.rs',
      'errors.rs',
      'http.rs',
      'platform/mod.rs',
      'platform/window.rs',
      'platform/external_url.rs',
      'hermes/mod.rs',
      'hermes/config.rs',
      'hermes/auth.rs',
      'hermes/dashboard_http.rs',
      'hermes/files.rs',
      'hermes/gateway_ws.rs',
      'monitoring/mod.rs',
      'monitoring/config.rs',
      'monitoring/auth.rs',
      'monitoring/beszel.rs',
      'commands/mod.rs',
      'commands/config.rs',
      'commands/dashboard.rs',
      'commands/gateway.rs',
      'commands/monitoring.rs',
      'commands/platform.rs'
    ])
  })

  it('keeps lib.rs as the app builder and invoke-handler switchboard only', () => {
    expect(libSource).toContain('mod commands;')
    expect(libSource).toContain('mod hermes;')
    expect(libSource).toContain('mod monitoring;')
    expect(libSource).toContain('mod platform;')
    expect(libSource).toContain('tauri::generate_handler!')
    expect(libSource).toContain('commands::config::get_connection_config')
    expect(libSource).toContain('commands::gateway::connect_ws')
    expect(libSource).toContain('commands::monitoring::monitoring_request')
    expect(libSource).not.toMatch(/fn\s+resolve_gateway_config/)
    expect(libSource).not.toMatch(/fn\s+monitoring_auth_token/)
    expect(libSource).not.toMatch(/fn\s+open_url_in_browser/)
  })

  it('does not leak Hermes, monitoring, or platform concerns across Rust lanes', () => {
    expect(hermesConfigSource).not.toMatch(/MONITORING_|Beszel/)
    expect(monitoringConfigSource).not.toMatch(/HERMES_DASHBOARD|BITCH_DASHBOARD|GatewayConfig/)
    expect(`${platformWindowSource}\n${platformExternalUrlSource}`).not.toMatch(
      /HERMES_DASHBOARD|MONITORING_|Beszel|dashboard_request|monitoring_request/
    )
    expect(commandsDashboardSource).toContain('crate::hermes::dashboard_http')
    expect(commandsDashboardSource).not.toContain('monitoring')
    expect(commandsMonitoringSource).toContain('crate::monitoring::beszel')
    expect(commandsMonitoringSource).not.toContain('dashboard_http')
  })
})
