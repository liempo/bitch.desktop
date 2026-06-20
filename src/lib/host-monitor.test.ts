import { describe, expect, it, vi } from 'vitest'

import {
  fetchHostMetrics,
  formatBytes,
  formatPercent,
  formatUptime,
  hostMonitorConfig,
  normalizeHostMetrics
} from './host-monitor'

describe('host monitor helpers', () => {
  it('builds a metrics URL from HOST_MONITOR_URL and HOST_MONITOR_PORT style values', () => {
    expect(hostMonitorConfig({ url: 'http://homestation.local', port: '9129' })).toEqual({
      baseUrl: 'http://homestation.local:9129',
      metricsUrl: 'http://homestation.local:9129/metrics',
      port: '9129'
    })

    expect(hostMonitorConfig({ url: 'http://127.0.0.1:9999', port: '9129' }).metricsUrl).toBe(
      'http://127.0.0.1:9999/metrics'
    )
  })

  it('normalizes host monitor payloads into the UI contract', () => {
    const metrics = normalizeHostMetrics({
      cpu: { cores: 4, model: 'host cpu', perCorePercent: [10, 20], usagePercent: 15.5 },
      hostname: 'homestation',
      memory: { totalBytes: 1024, usedBytes: 512, availableBytes: 512, usedPercent: 50 },
      processCount: 42,
      thermal: [{ celsius: 48.5, label: 'pkg' }],
      uptimeSeconds: 3661
    })

    expect(metrics.cpu.model).toBe('host cpu')
    expect(metrics.memory.usedPercent).toBe(50)
    expect(metrics.thermal[0]).toEqual({ celsius: 48.5, label: 'pkg' })
  })

  it('formats host metric display values', () => {
    expect(formatBytes(16 * 1024 ** 3)).toBe('16 GB')
    expect(formatPercent(33.333)).toBe('33.3%')
    expect(formatUptime(3661)).toBe('01:01:01')
  })

  it('fetches metrics from the configured sidecar endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cpu: { cores: 2, usagePercent: 25 }, memory: { usedPercent: 40 } })
    })

    const metrics = await fetchHostMetrics(
      { baseUrl: 'http://127.0.0.1:9129', metricsUrl: 'http://127.0.0.1:9129/metrics', port: '9129' },
      fetcher as unknown as typeof fetch
    )

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:9129/metrics', { cache: 'no-store' })
    expect(metrics.cpu.usagePercent).toBe(25)
  })
})
