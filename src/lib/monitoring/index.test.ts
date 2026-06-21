import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

import {
  fetchHostMetrics,
  formatBytes,
  formatPercent,
  formatUptime,
  hostMonitorConfig,
  normalizeHostMetrics,
  requestHostMonitorJson,
  sortHostProcesses
} from './index'

const GIB = 1024 ** 3

const beszelSystem = {
  host: '10.0.0.2',
  id: 'system_1',
  info: {
    cpu: 18,
    dp: 55,
    la: [0.1, 0.2, 0.3],
    mp: 40,
    os: 0,
    u: 3661,
    v: '0.13.8'
  },
  name: 'homestation',
  status: 'up',
  updated: '2026-06-21 05:00:00.000Z',
  v: '0.13.8'
}

const beszelDetails = {
  cores: 8,
  cpu: 'Ryzen 7',
  hostname: 'homestation.local',
  kernel: '6.8.0-31-generic',
  memory: 32 * GIB,
  os: 0,
  os_name: 'Ubuntu 24.04 LTS',
  threads: 16
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
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('builds a Beszel collection API URL from a full MONITORING_URL value', () => {
    expect(hostMonitorConfig({ systemId: '', url: 'http://homestation:8090' })).toEqual({
      baseUrl: 'http://homestation:8090',
      metricsUrl: 'http://homestation:8090/api/collections',
      port: '8090',
      systemId: ''
    })

    expect(hostMonitorConfig({ systemId: '', url: 'http://homestation:8090/' }).metricsUrl).toBe(
      'http://homestation:8090/api/collections'
    )
  })

  it('normalizes accidental Beszel system page URLs and derives the system ID', () => {
    expect(
      hostMonitorConfig({ url: 'https://monitoring.airplane-skilift.ts.net/system/el6ygn9w6w41w41?tab=cpu' })
    ).toEqual({
      baseUrl: 'https://monitoring.airplane-skilift.ts.net',
      metricsUrl: 'https://monitoring.airplane-skilift.ts.net/api/collections',
      port: '443',
      systemId: 'el6ygn9w6w41w41'
    })

    expect(
      hostMonitorConfig({
        systemId: 'explicit_system',
        url: 'https://monitoring.airplane-skilift.ts.net/system/el6ygn9w6w41w41'
      }).systemId
    ).toBe('explicit_system')
  })

  it('normalizes Beszel system and latest stats records into the UI contract', () => {
    const metrics = normalizeHostMetrics({
      details: beszelDetails,
      system: beszelSystem,
      statsRecord: beszelStatsRecord
    })

    expect(metrics.cpu).toMatchObject({
      cores: 8,
      loadAverage: [0.4, 0.5, 0.6],
      model: 'Ryzen 7',
      perCorePercent: [10, 20, 30, 40],
      usagePercent: 22.5
    })
    expect(metrics.disk).toMatchObject({
      totalBytes: 512 * GIB,
      usedBytes: 256 * GIB,
      usedPercent: 50
    })
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
    expect(metrics.platform).toBe('Ubuntu 24.04 LTS')
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

  it('normalizes Beszel system detail aliases used by Go structs and PocketBase records', () => {
    const statsWithoutMemoryTotal: Record<string, unknown> = { ...beszelStatsRecord.stats }
    delete statsWithoutMemoryTotal.m

    const metrics = normalizeHostMetrics({
      details: {
        CoreCount: 4,
        CpuModel: 'AMD Ryzen 7 5700G',
        Kernel: '6.8.0-31-generic',
        MemoryTotal: 32 * GIB,
        OsName: 'Ubuntu 24.04 LTS'
      },
      statsRecord: { ...beszelStatsRecord, stats: statsWithoutMemoryTotal },
      system: beszelSystem
    })

    expect(metrics.cpu.cores).toBe(4)
    expect(metrics.cpu.model).toBe('AMD Ryzen 7 5700G')
    expect(metrics.memory.totalBytes).toBe(32 * GIB)
    expect(metrics.platform).toBe('Ubuntu 24.04 LTS')
  })

  it('sorts host process lists by CPU or memory usage', () => {
    const processes = [
      {
        command: 'memory-heavy',
        cpuPercent: 2,
        memoryBytes: 600,
        memoryPercent: 60,
        name: 'memory-heavy',
        pid: 1,
        status: '',
        user: ''
      },
      {
        command: 'cpu-heavy',
        cpuPercent: 90,
        memoryBytes: 50,
        memoryPercent: 5,
        name: 'cpu-heavy',
        pid: 2,
        status: '',
        user: ''
      }
    ]

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

  it('does not normalize legacy Glances payloads into the Beszel contract', () => {
    const metrics = normalizeHostMetrics({
      mem: { total: 1000, used: 500 },
      processes: [{ cpu_percent: 90, memory_info: { rss: 50 }, name: 'cpu-heavy', pid: 2 }],
      quicklook: { cpu: 99, cpu_name: 'legacy cpu' }
    })

    expect(metrics.cpu.usagePercent).toBe(0)
    expect(metrics.cpu.model).toBe('unknown')
    expect(metrics.memory.totalBytes).toBe(0)
    expect(metrics.processes).toEqual([])
    expect(metrics.version).toBe('beszel')
  })

  it('fetches metrics from Beszel PocketBase collections without calling legacy per-endpoint monitor routes', async () => {
    const requestJson = vi.fn().mockImplementation(async (path: string) => {
      const parsed = new URL(path, 'http://host-monitor.local')
      if (parsed.pathname === '/api/collections/systems/records') {
        return { items: [beszelSystem] }
      }
      if (parsed.pathname === '/api/collections/system_stats/records') {
        expect(parsed.searchParams.get('filter')).toContain('system')
        expect(parsed.searchParams.get('filter')).toContain('system_1')
        return { items: [beszelStatsRecord] }
      }
      if (parsed.pathname === '/api/collections/system_details/records/system_1') {
        expect(parsed.searchParams.get('fields')).toContain('hostname,kernel,cores,threads,cpu')
        return beszelDetails
      }
      throw new Error(`unexpected path ${path}`)
    })

    const metrics = await fetchHostMetrics(
      {
        baseUrl: 'http://127.0.0.1:8090',
        metricsUrl: 'http://127.0.0.1:8090/api/collections',
        port: '8090',
        systemId: ''
      },
      requestJson
    )

    expect(requestJson).toHaveBeenCalledWith(expect.stringContaining('/api/collections/systems/records'))
    expect(requestJson).toHaveBeenCalledWith(expect.stringContaining('/api/collections/system_stats/records'))
    expect(requestJson).toHaveBeenCalledWith(
      expect.stringContaining('/api/collections/system_details/records/system_1')
    )
    expect(requestJson).not.toHaveBeenCalledWith(expect.stringContaining('/api/4/'))
    expect(requestJson).not.toHaveBeenCalledWith(expect.stringContaining('/processlist'))
    expect(metrics.cpu.model).toBe('Ryzen 7')
    expect(metrics.cpu.usagePercent).toBe(22.5)
    expect(metrics.disk).toMatchObject({ totalBytes: 512 * GIB, usedBytes: 256 * GIB, usedPercent: 50 })
    expect(metrics.memory.usedPercent).toBe(37.5)
    expect(metrics.platform).toBe('Ubuntu 24.04 LTS')
    expect(metrics.processes).toEqual([])
  })

  it('fetches a configured Beszel system directly before loading latest stats', async () => {
    const requestJson = vi.fn().mockImplementation(async (path: string) => {
      const parsed = new URL(path, 'http://host-monitor.local')
      if (parsed.pathname === '/api/collections/systems/records/el6ygn9w6w41w41') return beszelSystem
      if (parsed.pathname === '/api/collections/system_stats/records') return { items: [beszelStatsRecord] }
      if (parsed.pathname === '/api/collections/system_details/records/el6ygn9w6w41w41') return beszelDetails
      throw new Error(`unexpected path ${path}`)
    })

    const metrics = await fetchHostMetrics(
      {
        baseUrl: 'https://monitoring.airplane-skilift.ts.net',
        metricsUrl: 'https://monitoring.airplane-skilift.ts.net/api/collections',
        port: '443',
        systemId: 'el6ygn9w6w41w41'
      },
      requestJson
    )

    expect(requestJson).toHaveBeenNthCalledWith(1, '/api/collections/systems/records/el6ygn9w6w41w41')
    expect(metrics.cpu.usagePercent).toBe(22.5)
  })

  it('uses the Tauri host monitor command for default requests', async () => {
    mockInvoke.mockResolvedValueOnce({ items: [] })

    await requestHostMonitorJson('/api/collections/systems/records?page=1')

    expect(mockInvoke).toHaveBeenCalledWith('host_monitor_request', {
      request: {
        method: 'GET',
        path: '/api/collections/systems/records?page=1'
      }
    })
  })

  it('explains that empty Beszel system listings are usually auth or visibility problems', async () => {
    const requestJson = vi.fn().mockResolvedValue({ items: [] })

    await expect(
      fetchHostMetrics(
        {
          baseUrl: 'https://monitoring.airplane-skilift.ts.net',
          metricsUrl: 'https://monitoring.airplane-skilift.ts.net/api/collections',
          port: '443',
          systemId: ''
        },
        requestJson
      )
    ).rejects.toThrow(/MONITORING_EMAIL\/MONITORING_PASSWORD/)
  })
})
