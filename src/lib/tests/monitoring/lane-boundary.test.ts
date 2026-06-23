import { describe, expect, it } from 'vitest'

import adapterSource from '../../monitoring/adapters/beszel-monitoring-adapter.ts?raw'
import applicationSource from '../../monitoring/application/get-monitoring-metrics.ts?raw'
import formatSource from '../../monitoring/domain/format.ts?raw'
import metricsSource from '../../monitoring/domain/metrics.ts?raw'
import normalizeSource from '../../monitoring/domain/normalize.ts?raw'
import portSource from '../../monitoring/ports/monitoring-port.ts?raw'

const monitoringLaneSources = {
  'domain/metrics.ts': metricsSource,
  'domain/normalize.ts': normalizeSource,
  'domain/format.ts': formatSource,
  'ports/monitoring-port.ts': portSource,
  'adapters/beszel-monitoring-adapter.ts': adapterSource,
  'application/get-monitoring-metrics.ts': applicationSource
}

describe('monitoring lane boundaries', () => {
  it('keeps the Beszel monitoring lane split into domain, port, adapter, and application modules', () => {
    expect(Object.keys(monitoringLaneSources)).toEqual([
      'domain/metrics.ts',
      'domain/normalize.ts',
      'domain/format.ts',
      'ports/monitoring-port.ts',
      'adapters/beszel-monitoring-adapter.ts',
      'application/get-monitoring-metrics.ts'
    ])
  })

  it('does not import Hermes dashboard/runtime modules from the standalone monitoring lane', () => {
    const forbiddenImports = [
      /from ['"]\$lib\/api(?:\/|['"])/,
      /from ['"]\$lib\/hermes(?:\/|['"])/,
      /from ['"]\$lib\/gateway(?:\/|['"])/,
      /from ['"]\$lib\/files(?:\/|['"])/,
      /from ['"]\$lib\/session(?:\/|['"])/,
      /from ['"]\$lib\/conversation(?:\/|['"])/,
      /dashboard_request/,
      /HERMES_DASHBOARD/
    ]

    const offenders = Object.entries(monitoringLaneSources).flatMap(([file, source]) =>
      forbiddenImports.filter(pattern => pattern.test(source)).map(pattern => `${file}: ${pattern.source}`)
    )

    expect(offenders).toEqual([])
  })
})
