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

describe('host monitor helpers', () => {
  it('builds a Glances API URL from a full HOST_MONITOR_URL value', () => {
    expect(hostMonitorConfig({ url: 'http://homestation:61208' })).toEqual({
      baseUrl: 'http://homestation:61208',
      metricsUrl: 'http://homestation:61208/api/4',
      port: '61208'
    })

    expect(hostMonitorConfig({ url: 'http://homestation:61208/' }).metricsUrl).toBe('http://homestation:61208/api/4')
  })

  it('normalizes Glances API payloads into the UI contract', () => {
    const metrics = normalizeHostMetrics({
      cpu: { cpucore: 4, total: 15.5 },
      load: { min1: 0.1, min5: 0.2, min15: 0.3 },
      fs: [
        { mnt_point: '/etc/resolv.conf', percent: 99, size: 1 },
        { mnt_point: '/', percent: 42.5, size: 2048 }
      ],
      mem: { available: 512, percent: 50, total: 1024, used: 512 },
      memswap: { percent: 10, total: 100, used: 10 },
      percpu: [{ total: 10 }, { total: 20 }],
      processcount: { total: 42 },
      processlist: [
        { cpu_percent: 12.5, memory_info: { rss: 256 }, memory_percent: 25, name: 'node', pid: 101, username: 'hermes' }
      ],
      quicklook: { cpu_name: 'host cpu' },
      sensors: [{ label: 'pkg', unit: 'C', value: 48.5 }],
      status: { version: '4.5.5' },
      system: { hostname: 'homestation', hr_name: 'Linux 6.12' },
      uptime: '2 days, 01:02:03'
    })

    expect(metrics.cpu).toMatchObject({ cores: 4, model: 'host cpu', perCorePercent: [10, 20], usagePercent: 15.5 })
    expect(metrics.disk.usedPercent).toBe(42.5)
    expect(metrics.memory).toMatchObject({ totalBytes: 1024, usedBytes: 512, usedPercent: 50 })
    expect(metrics.processCount).toBe(42)
    expect(metrics.processes[0]).toMatchObject({
      cpuPercent: 12.5,
      memoryPercent: 25,
      name: 'node',
      pid: 101,
      user: 'hermes'
    })
    expect(metrics.thermal[0]).toEqual({ celsius: 48.5, label: 'pkg' })
    expect(metrics.uptimeSeconds).toBe(176_523)
    expect(metrics.version).toBe('4.5.5')
  })

  it('uses bind-mounted filesystem samples as disk fallback when Glances does not expose root', () => {
    const metrics = normalizeHostMetrics({
      fs: [
        { mnt_point: '/etc/resolv.conf', percent: 77.6, size: 269_427_478_528 },
        { mnt_point: '/etc/hostname', percent: 77.6, size: 269_427_478_528 },
        { mnt_point: '/etc/hosts', percent: 77.6, size: 269_427_478_528 }
      ]
    })

    expect(metrics.disk.usedPercent).toBe(77.6)
  })

  it('falls back to Glances quicklook/per-core CPU when the aggregate sample is cold', () => {
    expect(
      normalizeHostMetrics({ cpu: { total: 0 }, percpu: [{ total: 80 }, { total: 40 }], quicklook: {} }).cpu
        .usagePercent
    ).toBe(60)
    expect(normalizeHostMetrics({ cpu: { total: 0 }, quicklook: { cpu: 12.5 } }).cpu.usagePercent).toBe(12.5)
  })

  it('sorts host process lists by CPU or memory usage', () => {
    const processes = normalizeHostMetrics({
      mem: { total: 1000 },
      processlist: [
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
    expect(formatBytes(16 * 1024 ** 3)).toBe('16 GB')
    expect(formatPercent(33.333)).toBe('33.3%')
    expect(formatUptime(3661)).toBe('01:01:01')
  })

  it('fetches metrics from the configured Glances API endpoints including disk and process samples', async () => {
    const payloadByPath: Record<string, unknown> = {
      '/cpu': { cpucore: 2, total: 25 },
      '/fs': [{ mnt_point: '/', percent: 61, size: 1000 }],
      '/load': { min1: 0.1, min5: 0.2, min15: 0.3 },
      '/mem': { available: 600, percent: 40, total: 1000, used: 400 },
      '/memswap': { percent: 0, total: 0, used: 0 },
      '/percpu': [{ total: 20 }, { total: 30 }],
      '/processcount': { total: 12 },
      '/processlist': [{ cpu_percent: 35, memory_percent: 10, name: 'python', pid: 99 }],
      '/quicklook': { cpu_name: 'glances cpu' },
      '/sensors': [],
      '/status': { version: '4.5.5' },
      '/system': { hostname: 'glances-host' },
      '/uptime': '00:01:00'
    }
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const path = new URL(url).pathname.replace('/api/4', '')
      return {
        ok: true,
        json: async () => payloadByPath[path]
      }
    })

    const metrics = await fetchHostMetrics(
      { baseUrl: 'http://127.0.0.1:61208', metricsUrl: 'http://127.0.0.1:61208/api/4', port: '61208' },
      fetcher as unknown as typeof fetch
    )

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:61208/api/4/cpu', { cache: 'no-store' })
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:61208/api/4/fs', { cache: 'no-store' })
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:61208/api/4/processlist', { cache: 'no-store' })
    expect(fetcher).not.toHaveBeenCalledWith('http://127.0.0.1:61208/api/4/all', expect.anything())
    expect(metrics.cpu.usagePercent).toBe(25)
    expect(metrics.disk.usedPercent).toBe(61)
    expect(metrics.memory.usedPercent).toBe(40)
    expect(metrics.processes[0]).toMatchObject({ cpuPercent: 35, memoryPercent: 10, name: 'python' })
  })
})
