import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

import {
  fetchMonitoringMetrics,
  formatBytes,
  formatPercent,
  formatUptime,
  monitoringConfig,
  normalizeBeszelContainers,
  normalizeMonitoringMetrics,
  requestMonitoringJson,
  sortMonitoringContainers
} from './index'

const MIB = 1024 ** 2
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

const beszelContainers = [
  {
    cpu: 18.25,
    id: 'container_web',
    image: 'ghcr.io/example/web:latest',
    memory: 1536,
    name: 'web',
    ports: '0.0.0.0:443->443/tcp',
    status: 'running',
    system: 'system_1',
    updated: '2026-06-21 05:01:00.000Z'
  },
  {
    cpu: '3.5',
    health: 'healthy',
    id: 'container_worker',
    image: 'ghcr.io/example/worker:latest',
    memory: '256',
    name: 'worker',
    ports: '',
    system: 'system_1',
    updated: '2026-06-21 05:01:00.000Z'
  }
]

describe('monitoring helpers', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('builds a Beszel collection API URL from a full MONITORING_URL value', () => {
    expect(monitoringConfig({ systemId: '', url: 'http://homestation:8090' })).toEqual({
      baseUrl: 'http://homestation:8090',
      metricsUrl: 'http://homestation:8090/api/collections',
      port: '8090',
      systemId: ''
    })

    expect(monitoringConfig({ systemId: '', url: 'http://homestation:8090/' }).metricsUrl).toBe(
      'http://homestation:8090/api/collections'
    )
  })

  it('normalizes accidental Beszel system page URLs and derives the system ID', () => {
    expect(
      monitoringConfig({ url: 'https://monitoring.airplane-skilift.ts.net/system/el6ygn9w6w41w41?tab=cpu' })
    ).toEqual({
      baseUrl: 'https://monitoring.airplane-skilift.ts.net',
      metricsUrl: 'https://monitoring.airplane-skilift.ts.net/api/collections',
      port: '443',
      systemId: 'el6ygn9w6w41w41'
    })

    expect(
      monitoringConfig({
        systemId: 'explicit_system',
        url: 'https://monitoring.airplane-skilift.ts.net/system/el6ygn9w6w41w41'
      }).systemId
    ).toBe('explicit_system')
  })

  it('normalizes Beszel system and latest stats records into the UI contract', () => {
    const metrics = normalizeMonitoringMetrics({
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
    expect(metrics.systemName).toBe('homestation.local')
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
    expect(metrics.containerCount).toBe(0)
    expect(metrics.containers).toEqual([])
    expect(metrics.thermal).toEqual([
      { celsius: 48.5, label: 'CPU' },
      { celsius: 41, label: 'NVMe' }
    ])
    expect(metrics.timestamp).toBe('2026-06-21 05:01:00.000Z')
    expect(metrics.uptimeSeconds).toBe(3661)
    expect(metrics.version).toBe('beszel 0.13.8')
  })

  it('normalizes Beszel container records into dashboard container rows', () => {
    const rows = normalizeBeszelContainers({ items: beszelContainers }, 32 * GIB)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      cpuPercent: 18.25,
      id: 'container_web',
      image: 'ghcr.io/example/web:latest',
      memoryBytes: 1536 * MIB,
      name: 'web',
      ports: '0.0.0.0:443->443/tcp',
      status: 'running'
    })
    expect(rows[0].memoryPercent).toBeCloseTo(4.6875)
    expect(formatBytes(rows[0].memoryBytes)).toBe('1.5 GB')
    expect(rows[1]).toMatchObject({
      cpuPercent: 3.5,
      image: 'ghcr.io/example/worker:latest',
      memoryBytes: 256 * MIB,
      name: 'worker',
      status: 'healthy'
    })
    expect(formatBytes(rows[1].memoryBytes)).toBe('256 MB')
  })

  it('normalizes Beszel system detail aliases used by Go structs and PocketBase records', () => {
    const statsWithoutMemoryTotal: Record<string, unknown> = { ...beszelStatsRecord.stats }
    delete statsWithoutMemoryTotal.m

    const metrics = normalizeMonitoringMetrics({
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

  it('sorts monitoring container lists by CPU or memory usage', () => {
    const containers = [
      {
        cpuPercent: 2,
        image: 'memory-heavy:latest',
        memoryBytes: 600,
        memoryPercent: 60,
        name: 'memory-heavy',
        ports: '',
        status: ''
      },
      {
        cpuPercent: 90,
        image: 'cpu-heavy:latest',
        memoryBytes: 50,
        memoryPercent: 5,
        name: 'cpu-heavy',
        ports: '',
        status: ''
      }
    ]

    expect(sortMonitoringContainers(containers, 'cpu')[0].name).toBe('cpu-heavy')
    expect(sortMonitoringContainers(containers, 'cpu', 'asc')[0].name).toBe('memory-heavy')
    expect(sortMonitoringContainers(containers, 'memory')[0].name).toBe('memory-heavy')
    expect(sortMonitoringContainers(containers, 'memory', 'asc')[0].name).toBe('cpu-heavy')
  })

  it('formats monitoring metric display values', () => {
    expect(formatBytes(16 * GIB)).toBe('16 GB')
    expect(formatPercent(33.333)).toBe('33.3%')
    expect(formatUptime(3661)).toBe('01:01:01')
  })

  it('does not normalize legacy Glances payloads into the Beszel contract', () => {
    const metrics = normalizeMonitoringMetrics({
      mem: { total: 1000, used: 500 },
      quicklook: { cpu: 99, cpu_name: 'legacy cpu' }
    })

    expect(metrics.cpu.usagePercent).toBe(0)
    expect(metrics.cpu.model).toBe('unknown')
    expect(metrics.memory.totalBytes).toBe(0)
    expect(metrics.containers).toEqual([])
    expect(metrics.version).toBe('beszel')
  })

  it('fetches metrics from Beszel PocketBase collections without calling legacy per-endpoint monitor routes', async () => {
    const requestJson = vi.fn().mockImplementation(async (path: string) => {
      const parsed = new URL(path, 'http://monitoring.local')
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
      if (parsed.pathname === '/api/collections/containers/records') {
        expect(parsed.searchParams.get('fields')).toContain('id,name,image,ports,cpu,memory')
        expect(parsed.searchParams.get('filter')).toContain('system')
        expect(parsed.searchParams.get('filter')).toContain('system_1')
        expect(parsed.searchParams.get('perPage')).toBe('2000')
        expect(parsed.searchParams.get('sort')).toBe('-cpu')
        return { items: beszelContainers }
      }
      throw new Error(`unexpected path ${path}`)
    })

    const metrics = await fetchMonitoringMetrics(
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
    expect(requestJson).toHaveBeenCalledWith(expect.stringContaining('/api/collections/containers/records'))
    expect(requestJson).not.toHaveBeenCalledWith(expect.stringContaining('/api/4/'))
    expect(requestJson).not.toHaveBeenCalledWith(expect.stringContaining('/processlist'))
    expect(metrics.cpu.model).toBe('Ryzen 7')
    expect(metrics.cpu.usagePercent).toBe(22.5)
    expect(metrics.disk).toMatchObject({ totalBytes: 512 * GIB, usedBytes: 256 * GIB, usedPercent: 50 })
    expect(metrics.memory.usedPercent).toBe(37.5)
    expect(metrics.platform).toBe('Ubuntu 24.04 LTS')
    expect(metrics.containerCount).toBe(2)
    expect(metrics.containers[0]).toMatchObject({
      cpuPercent: 18.25,
      id: 'container_web',
      image: 'ghcr.io/example/web:latest',
      memoryBytes: 1536 * MIB,
      name: 'web',
      ports: '0.0.0.0:443->443/tcp',
      status: 'running'
    })
  })

  it('fetches a configured Beszel system directly before loading latest stats', async () => {
    const requestJson = vi.fn().mockImplementation(async (path: string) => {
      const parsed = new URL(path, 'http://monitoring.local')
      if (parsed.pathname === '/api/collections/systems/records/el6ygn9w6w41w41') return beszelSystem
      if (parsed.pathname === '/api/collections/system_stats/records') return { items: [beszelStatsRecord] }
      if (parsed.pathname === '/api/collections/system_details/records/el6ygn9w6w41w41') return beszelDetails
      throw new Error(`unexpected path ${path}`)
    })

    const metrics = await fetchMonitoringMetrics(
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

  it('uses the Tauri monitoring command for default requests', async () => {
    mockInvoke.mockResolvedValueOnce({ items: [] })

    await requestMonitoringJson('/api/collections/systems/records?page=1')

    expect(mockInvoke).toHaveBeenCalledWith('monitoring_request', {
      request: {
        method: 'GET',
        path: '/api/collections/systems/records?page=1'
      }
    })
  })

  it('explains that empty Beszel system listings are usually auth or visibility problems', async () => {
    const requestJson = vi.fn().mockResolvedValue({ items: [] })

    await expect(
      fetchMonitoringMetrics(
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
