import { describe, expect, it, vi } from 'vitest'

import {
  fetchHostMetrics,
  formatBytes,
  formatPercent,
  formatUptime,
  hostMonitorConfig,
  normalizeHostMetrics,
  sortHostProcesses
} from './host-monitor'

const GIB = 1024 ** 3

const beszelSystem = {
  host: '10.0.0.2',
  id: 'system_1',
  info: {
    c: 8,
    cpu: 18,
    dp: 55,
    h: 'homestation.local',
    la: [0.1, 0.2, 0.3],
    m: 'Ryzen 7',
    mp: 40,
    u: 3661,
    v: '0.13.8'
  },
  name: 'homestation',
  status: 'up',
  updated: '2026-06-21 05:00:00.000Z',
  v: '0.13.8'
}

const beszelStatsRecord = {
  created: '2026-06-21 05:01:00.000Z',
  stats: {
    cpu: 22.5,
    cpus: [10, 20, 30, 40],
    d: 512,
    dp: 50,
    du: 256,
    la: [0.4, 0.5, 0.6],
    m: 32,
    mp: 37.5,
    mu: 12,
    s: 4,
    su: 1,
    t: {
      CPU: 48.5,
      NVMe: 41
    }
  }
}

describe('host monitor helpers', () => {
  it('builds a Beszel collection API URL from a full HOST_MONITOR_URL value', () => {
    expect(hostMonitorConfig({ url: 'http://homestation:8090' })).toEqual({
      baseUrl: 'http://homestation:8090',
      metricsUrl: 'http://homestation:8090/api/collections',
      port: '8090'
    })

    expect(hostMonitorConfig({ url: 'http://homestation:8090/' }).metricsUrl).toBe(
      'http://homestation:8090/api/collections'
    )
  })

  it('normalizes Beszel system and latest stats records into the UI contract', () => {
    const metrics = normalizeHostMetrics({ system: beszelSystem, statsRecord: beszelStatsRecord })

    expect(metrics.cpu).toMatchObject({
      cores: 8,
      loadAverage: [0.4, 0.5, 0.6],
      model: 'Ryzen 7',
      perCorePercent: [10, 20, 30, 40],
      usagePercent: 22.5
    })
    expect(metrics.disk.usedPercent).toBe(50)
    expect(metrics.hostname).toBe('homestation.local')
    expect(metrics.memory).toMatchObject({
      availableBytes: 20 * GIB,
      swapTotalBytes: 4 * GIB,
      swapUsedBytes: 1 * GIB,
      swapUsedPercent: 25,
      totalBytes: 32 * GIB,
      usedBytes: 12 * GIB,
      usedPercent: 37.5
    })
    expect(metrics.processCount).toBe(0)
    expect(metrics.processes).toEqual([])
    expect(metrics.thermal).toEqual([
      { celsius: 48.5, label: 'CPU' },
      { celsius: 41, label: 'NVMe' }
    ])
    expect(metrics.timestamp).toBe('2026-06-21 05:01:00.000Z')
    expect(metrics.uptimeSeconds).toBe(3661)
    expect(metrics.version).toBe('beszel 0.13.8')
  })

  it('sorts host process lists by CPU or memory usage', () => {
    const processes = normalizeHostMetrics({
      mem: { total: 1000 },
      processes: [
        { cpu_percent: 2, memory_info: { rss: 600 }, name: 'memory-heavy', pid: 1 },
        { cpu_percent: 90, memory_info: { rss: 50 }, name: 'cpu-heavy', pid: 2 }
      ]
    }).processes

    expect(sortHostProcesses(processes, 'cpu')[0].name).toBe('cpu-heavy')
    expect(sortHostProcesses(processes, 'cpu', 'asc')[0].name).toBe('memory-heavy')
    expect(sortHostProcesses(processes, 'memory')[0].name).toBe('memory-heavy')
    expect(sortHostProcesses(processes, 'memory', 'asc')[0].name).toBe('cpu-heavy')
  })

  it('formats host metric display values', () => {
    expect(formatBytes(16 * GIB)).toBe('16 GB')
    expect(formatPercent(33.333)).toBe('33.3%')
    expect(formatUptime(3661)).toBe('01:01:01')
  })

  it('fetches metrics from Beszel PocketBase collections without calling legacy per-endpoint monitor routes', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/api/collections/systems/records') {
        return {
          ok: true,
          json: async () => ({ items: [beszelSystem] })
        }
      }
      if (parsed.pathname === '/api/collections/system_stats/records') {
        expect(parsed.searchParams.get('filter')).toContain('system')
        expect(parsed.searchParams.get('filter')).toContain('system_1')
        return {
          ok: true,
          json: async () => ({ items: [beszelStatsRecord] })
        }
      }
      throw new Error(`unexpected URL ${url}`)
    })

    const metrics = await fetchHostMetrics(
      { baseUrl: 'http://127.0.0.1:8090', metricsUrl: 'http://127.0.0.1:8090/api/collections', port: '8090' },
      fetcher as unknown as typeof fetch
    )

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('http://127.0.0.1:8090/api/collections/systems/records'),
      { cache: 'no-store' }
    )
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('http://127.0.0.1:8090/api/collections/system_stats/records'),
      { cache: 'no-store' }
    )
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('/api/4/'), expect.anything())
    expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('/processlist'), expect.anything())
    expect(metrics.cpu.usagePercent).toBe(22.5)
    expect(metrics.disk.usedPercent).toBe(50)
    expect(metrics.memory.usedPercent).toBe(37.5)
    expect(metrics.processes).toEqual([])
  })
})
